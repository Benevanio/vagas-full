import {
  ScraperAlreadyRunningError,
  ScraperRunLockUnavailableError,
  scraperClient,
} from "./scraperClient";
import type {
  AdminScraper,
  GetJobsResult,
  JobsCountResult,
  ReprocessScrapeResult,
  ScraperStatus,
  TriggerScrapeResult,
} from "./scrapers.types";

export class ScrapersService {
  async triggerScrape(): Promise<TriggerScrapeResult> {
    try {
      return await scraperClient.triggerScrape();
    } catch (error) {
      if (
        error instanceof ScraperAlreadyRunningError ||
        error instanceof ScraperRunLockUnavailableError
      ) {
        // repropaga para o controller decidir o status HTTP (409)
        throw error;
      }
      throw new Error("falha ao disparar o scraper");
    }
  }

  async triggerScraper(name: string): Promise<TriggerScrapeResult> {
    const normalized = name.trim().toLowerCase();
    if (normalized !== "go-scraper") {
      throw new Error(`scraper desconhecido: ${name}`);
    }

    return this.triggerScrape();
  }

  async getStatus(): Promise<ScraperStatus> {
    return scraperClient.getStatus();
  }

  async listScrapers(): Promise<AdminScraper[]> {
    const status = await this.getStatus();
    const count = await this.getJobsCount().catch(() => null);

    return [
      {
        name: status.name ?? "go-scraper",
        status: status.running ? "running" : "idle",
        running: status.running,
        lastRunAt: status.lastRunAt ?? null,
        jobsCollected: count?.total ?? status.jobsCollected ?? null,
      },
    ];
  }

  async getJobs(limit?: number): Promise<GetJobsResult> {
    return scraperClient.getJobs(limit);
  }

  async getJobsCount(): Promise<JobsCountResult> {
    return scraperClient.getJobsCount();
  }

  async reprocessJobs(): Promise<ReprocessScrapeResult> {
    return scraperClient.reprocessJobs();
  }
}
