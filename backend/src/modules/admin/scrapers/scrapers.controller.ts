import type { Request, Response } from "express";
import type { AuditService } from "../audit/audit.service";
import {
  ScraperAlreadyRunningError,
  ScraperRunLockUnavailableError,
} from "./scraperClient";
import { ScrapersService } from "./scrapers.service";

export class ScrapersController {
  constructor(
    private readonly scrapersService: ScrapersService,
    private readonly auditService: AuditService,
  ) {}

  async trigger(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.scrapersService.triggerScrape();

      this.auditService.fromRequest(req, "scrapers.trigger");

      res.status(202).json(result);
    } catch (error) {
      if (error instanceof ScraperAlreadyRunningError) {
        res.status(409).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
        return;
      }
      if (error instanceof ScraperRunLockUnavailableError) {
        res.status(503).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
        return;
      }
      res.status(500).json({ ok: false, message: "erro ao iniciar scraper" });
    }
  }

  async triggerOne(req: Request, res: Response): Promise<void> {
    try {
      const scraperName = String(req.params.id ?? "");
      const result = await this.scrapersService.triggerScraper(scraperName);

      this.auditService.fromRequest(req, "scrapers.trigger", {
        type: "scrapers",
        id: scraperName,
      });

      res.status(202).json({ ...result, scraper: scraperName });
    } catch (error) {
      if (error instanceof ScraperAlreadyRunningError) {
        res.status(409).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
        return;
      }
      if (error instanceof ScraperRunLockUnavailableError) {
        res.status(503).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
        return;
      }

      const message =
        error instanceof Error &&
        error.message.startsWith("scraper desconhecido")
          ? error.message
          : "erro ao iniciar scraper";

      res.status(message.startsWith("scraper desconhecido") ? 404 : 500).json({
        ok: false,
        message,
      });
    }
  }

  async status(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.scrapersService.getStatus();

      this.auditService.fromRequest(req, "scrapers.read", {
        type: "scrapers",
        id: "status",
      });

      res.status(200).json(result);
    } catch {
      res.status(500).json({ message: "erro ao consultar status do scraper" });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const scrapers = await this.scrapersService.listScrapers();

      this.auditService.fromRequest(req, "scrapers.read", {
        type: "scrapers",
        id: "list",
      });

      res.status(200).json({ scrapers });
    } catch {
      res.status(500).json({ message: "erro ao listar scrapers" });
    }
  }

  async listJobs(req: Request, res: Response): Promise<void> {
    try {
      const rawLimit = Number(req.query?.limit);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
      const result = await this.scrapersService.getJobs(limit);

      this.auditService.fromRequest(req, "scrapers.read", {
        type: "scrapers",
        id: "jobs",
      });

      res.status(200).json(result);
    } catch {
      res.status(500).json({ message: "erro ao buscar vagas" });
    }
  }

  async jobsCount(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.scrapersService.getJobsCount();

      this.auditService.fromRequest(req, "scrapers.read", {
        type: "scrapers",
        id: "jobs-count",
      });

      res.status(200).json(result);
    } catch {
      res.status(500).json({ message: "erro ao contar vagas" });
    }
  }

  async reprocess(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.scrapersService.reprocessJobs();

      this.auditService.fromRequest(req, "scrapers.reprocess");

      res.status(202).json(result);
    } catch {
      res.status(500).json({ message: "erro ao reprocessar vagas" });
    }
  }
}
