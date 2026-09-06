import { Request, Response } from "express";
import { getIronSession } from "iron-session";
import { AppError } from "../../lib/errors";
import { sessionOptions } from "../../lib/session";
import { Session } from "../types/auth.types";
import { ReportsKpisQuery } from "./schemas/reports.schemas";
import { ReportsService } from "./reports.service";

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  private async requireUserId(req: Request, res: Response): Promise<string> {
    const session = await getIronSession<Session>(req, res, sessionOptions);
    if (!session.userId) {
      throw AppError.unauthorized();
    }
    return session.userId;
  }

  // GET /reports/kpis
  async getKpis(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);

    // já validado/normalizado por `validate({ query })` na rota.
    const { from, to } = req.query as unknown as ReportsKpisQuery;

    const report = await this.service.getKpis(userId, { from, to });
    return res.json(report);
  }
}
