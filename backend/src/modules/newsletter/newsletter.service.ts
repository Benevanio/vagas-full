import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { cacheAbsoluteSMembers, cacheGetJobsByIds } from "../../lib/cache";
import {
  getUserMatchTechnologies,
  type MatchableJob,
  type MatchedJob,
  scoreJobWithTechnologies,
} from "../jobs/services/jobMatch.service";

const JOB_INDEX_KEY = "scraper:jobs:index";

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
