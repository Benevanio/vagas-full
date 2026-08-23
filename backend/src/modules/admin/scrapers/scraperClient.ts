import { config } from "../../../config";
import type {
  GetJobsResult,
  JobsCountResult,
  ReprocessScrapeResult,
  ScraperStatus,
  TriggerScrapeResult,
} from "./scrapers.types";

const TIMEOUT_MS = 5000;

/** Lançado quando o Go scraper responde 409 (já em execução) */
export class ScraperAlreadyRunningError extends Error {
  readonly code = "SCRAPER_ALREADY_RUNNING";

  constructor(message = "Já existe uma execução do scraper em andamento.") {
    super(message);
    this.name = "ScraperAlreadyRunningError";
  }
}

export class ScraperRunLockUnavailableError extends Error {
  readonly code = "SCRAPER_RUN_LOCK_UNAVAILABLE";

  constructor(
    message = "Não foi possível confirmar a disponibilidade do scraper.",
  ) {
    super(message);
    this.name = "ScraperRunLockUnavailableError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.scraperUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 409) {
    const body = await response.json().catch(() => null);
    throw new ScraperAlreadyRunningError(body?.message);
  }

  if (response.status === 503) {
    const body = await response.json().catch(() => null);
    throw new ScraperRunLockUnavailableError(body?.message);
  }

  if (!response.ok) {
    throw new Error(`scraper respondeu HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export const scraperClient = {
  triggerScrape(): Promise<TriggerScrapeResult> {
    return request<TriggerScrapeResult>("/admin/scrape", { method: "POST" });
  },

  getStatus(): Promise<ScraperStatus> {
    return request<ScraperStatus>("/admin/scrape/status");
  },

  getJobs(limit?: number): Promise<GetJobsResult> {
    const suffix = limit && limit > 0 ? `?limit=${limit}` : "";
    return request<GetJobsResult>(`/admin/jobs${suffix}`);
  },

  getJobsCount(): Promise<JobsCountResult> {
    return request<JobsCountResult>("/admin/jobs/count");
  },

  reprocessJobs(): Promise<ReprocessScrapeResult> {
    return request<ReprocessScrapeResult>("/admin/jobs/reprocess", {
      method: "POST",
    });
  },
};
