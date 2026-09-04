import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db/client";
import { newsletterSends, users } from "../../db/schema";
import { cacheAbsoluteSMembers, cacheGetJobsByIds } from "../../lib/cache";
import {
  getUserMatchTechnologies,
  type MatchableJob,
  type MatchedJob,
  scoreJobWithTechnologies,
} from "../jobs/services/jobMatch.service";

const JOB_INDEX_KEY = "scraper:jobs:index";
const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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
