import { Router } from "express";
import { validate } from "../middleware/validate";
import { ReportsController } from "../modules/reports/reports.controller";
import { ReportsService } from "../modules/reports/reports.service";
import { buildReportsKpisQuerySchema } from "../modules/reports/schemas/reports.schemas";

const router = Router();
const service = new ReportsService();
const controller = new ReportsController(service);

router.get(
  "/kpis",
  // Constrói o schema a cada request: o default de "hoje" precisa refletir o
  // momento da chamada, não o horário em que o processo subiu.
  (req, res, next) => {
    validate({ query: buildReportsKpisQuerySchema() })(req, res, next);
  },
  (req, res, next) => {
    controller.getKpis(req, res).catch(next);
  },
);

export { router as reportsRoutes };
