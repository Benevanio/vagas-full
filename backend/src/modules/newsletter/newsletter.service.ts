import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getConfig } from "../../config";
import { db } from "../../db/client";
import { newsletterSends, savedJobs, userPreferences, users } from "../../db/schema";
import { cacheAbsoluteSMembers, cacheGetJobsByIds, getCache } from "../../lib/cache";
import { logWarn } from "../../logger";
import { generateUnsubscribeToken } from "../../lib/security/unsubscribeToken";
import { emailService } from "../email/email.service";
import {
  getUserMatchTechnologies,
  type MatchableJob,
  type MatchedJob,
  scoreJobWithTechnologies,
} from "../jobs/services/jobMatch.service";
import { fetchTechNews, type NewsItem } from "./newsFeed.service";
import { enqueueUserSend } from "./newsletter.queue";
import { toPublicUser } from "../users/users.mapper";

const JOB_INDEX_KEY = "scraper:jobs:index";
const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MATCHED_JOBS_LIMIT = 5;
const RECENT_SEND_LOOKBACK_WEEKS = 8;
const NEWS_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const APPLIED_STATUSES = ["applied", "interviewing", "accepted"] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Busca o índice global de vagas (Valkey), pontua pelo perfil do usuário
 * (motor já existente de `jobMatch.service.ts`, sem passar por
 * `JobProfileMatchService.enrich()` — evita disparar notificação de alto
 * match), exclui `excludeJobIds` e retorna as top `limit` por `matchScore`
 * desc (NEWSL-02).
 */
export async function computeMatchedJobsForUser(
  userId: string,
  excludeJobIds: string[],
  limit: number,
): Promise<MatchedJob[]> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const technologies = getUserMatchTechnologies(user);
  if (technologies.length === 0) return [];

  const jobIds = await cacheAbsoluteSMembers(JOB_INDEX_KEY);
  if (jobIds.length === 0) return [];

  const jobs = (await cacheGetJobsByIds(jobIds)) as MatchableJob[];
  const excludeSet = new Set(excludeJobIds);

  return jobs
    .map((job) => scoreJobWithTechnologies(job, technologies))
    .filter((job) => (job.matchScore ?? 0) > 0)
    .filter((job) => !excludeSet.has(String(job.id ?? "")))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, limit);
}

/**
 * Semana ISO 8601 da data informada, ex.: "2026-W36". Segue o padrão ISO de
 * semana-do-ano-que-contém-a-quinta-feira (funciona corretamente na virada
 * de ano, quando dez/31 ou jan/1 podem pertencer à semana 1 do ano seguinte
 * ou à última semana do ano anterior).
 */
export function getIsoWeek(date: Date): string {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );

  // Move a data-alvo para a quinta-feira da mesma semana ISO.
  const dayNumber = (target.getUTCDay() + 6) % 7; // segunda=0 ... domingo=6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  // A quinta-feira da semana 1 do ano ISO é sempre a semana que contém 4/jan.
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const weekNumber =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / MILLISECONDS_PER_WEEK,
    );

  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Agrega, sem duplicar, os `sentJobIds` de todas as newsletters enviadas ao
 * usuário nas últimas `weeksBack` semanas — usado como proxy de "frescor"
 * (dedup por histórico de envio, já que não há timestamp confiável de
 * "vaga adicionada" no catálogo — ver Risks do design) (NEWSL-02, NEWSL-09).
 */
export async function getRecentlySentJobIds(
  userId: string,
  weeksBack = 8,
): Promise<string[]> {
  const since = new Date(Date.now() - weeksBack * MILLISECONDS_PER_WEEK);

  const rows = await db
    .select({ sentJobIds: newsletterSends.sentJobIds })
    .from(newsletterSends)
    .where(
      and(eq(newsletterSends.userId, userId), gte(newsletterSends.createdAt, since)),
    );

  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of row.sentJobIds ?? []) {
      ids.add(id);
    }
  }

  return [...ids];
}

function newsCacheKey(isoWeek: string): string {
  return `newsletter:news:${isoWeek}`;
}

/**
 * Lê o snapshot de notícias da semana gravado por `runWeeklyTrigger`.
 * Ausente/expirado → `[]` (a falha de RSS nunca bloqueia o envio, NEWSL-08).
 */
async function getCachedNews(isoWeek: string): Promise<NewsItem[]> {
  const client = await getCache();
  const raw = await client.get(newsCacheKey(isoWeek));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function countApplications(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(savedJobs)
    .where(
      and(eq(savedJobs.userId, userId), inArray(savedJobs.status, APPLIED_STATUSES)),
    );

  return row?.value ?? 0;
}

/**
 * Processa o envio da newsletter semanal pra um usuário: checa idempotência
 * (`newsletter_sends` por `userId`+`isoWeek`), calcula vagas com match,
 * resumo de candidaturas e notícias, e envia via `emailService.send`
 * (nunca fala com o provedor direto — AD-001). Usuário excluído ou sem
 * e-mail válido no meio do processamento é pulado com `logWarn`, sem lançar
 * (NEWSL-01, NEWSL-03, NEWSL-04, NEWSL-05, NEWSL-06, NEWSL-09, NEWSL-12).
 */
export async function sendForUser(
  userId: string,
  isoWeek: string,
): Promise<void> {
  const existing = await db.query.newsletterSends.findFirst({
    where: and(
      eq(newsletterSends.userId, userId),
      eq(newsletterSends.isoWeek, isoWeek),
    ),
  });
  if (existing) return;

  const rawUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!rawUser) {
    logWarn("Usuário não encontrado para envio da newsletter.", {
      userId,
      isoWeek,
    });
    return;
  }

  const user = toPublicUser(rawUser);

  if (!user.email || !EMAIL_REGEX.test(user.email)) {
    logWarn("Usuário sem e-mail válido para envio da newsletter.", {
      userId,
      isoWeek,
    });
    return;
  }

  const excludeJobIds = await getRecentlySentJobIds(
    userId,
    RECENT_SEND_LOOKBACK_WEEKS,
  );
  const matchedJobs = await computeMatchedJobsForUser(
    userId,
    excludeJobIds,
    MATCHED_JOBS_LIMIT,
  );

  if (matchedJobs.length === 0) {
    await db.insert(newsletterSends).values({
      userId,
      isoWeek,
      status: "skipped_no_match",
      sentJobIds: [],
    });
    return;
  }

  const appliedCount = await countApplications(userId);
  const news = await getCachedNews(isoWeek);
  const { frontendUrl } = getConfig();
  const unsubscribeUrl = `${frontendUrl}/newsletter/unsubscribe?token=${generateUnsubscribeToken(userId)}`;

  await emailService.send({
    template: "newsletter",
    to: user.email,
    data: {
      name: user.displayName || user.firstName || "",
      matchedJobs,
      appliedCount,
      news,
      unsubscribeUrl,
      appUrl: frontendUrl,
    },
  });

  await db.insert(newsletterSends).values({
    userId,
    isoWeek,
    status: "sent",
    sentJobIds: matchedJobs.map((job) => String(job.id ?? "")),
  });
}

/** Grava o snapshot de notícias da semana no Valkey (TTL 7 dias). */
async function setCachedNews(isoWeek: string, news: NewsItem[]): Promise<void> {
  const client = await getCache();
  await client.set(newsCacheKey(isoWeek), JSON.stringify(news), {
    EX: NEWS_CACHE_TTL_SECONDS,
  });
}

async function getEligibleUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: userPreferences.userId })
    .from(userPreferences)
    .where(eq(userPreferences.emailNotifications, true));

  return rows.map((row) => row.userId);
}

async function getAlreadySentUserIds(isoWeek: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: newsletterSends.userId })
    .from(newsletterSends)
    .where(eq(newsletterSends.isoWeek, isoWeek));

  return new Set(rows.map((row) => row.userId));
}

/**
 * Dispara a execução semanal do job: busca notícias 1x (nunca por usuário)
 * e cacheia em Valkey, lista usuários opt-in (`emailNotifications=true`)
 * ainda sem `newsletter_sends` pra esta semana ISO e enfileira 1 job filho
 * por usuário elegível (NEWSL-01, NEWSL-07, NEWSL-10, NEWSL-11).
 */
export async function runWeeklyTrigger(): Promise<void> {
  const isoWeek = getIsoWeek(new Date());

  const news = await fetchTechNews();
  await setCachedNews(isoWeek, news);

  const [eligibleUserIds, alreadySentUserIds] = await Promise.all([
    getEligibleUserIds(),
    getAlreadySentUserIds(isoWeek),
  ]);

  const pendingUserIds = eligibleUserIds.filter(
    (userId) => !alreadySentUserIds.has(userId),
  );

  await Promise.all(
    pendingUserIds.map((userId) => enqueueUserSend(userId, isoWeek)),
  );
}
