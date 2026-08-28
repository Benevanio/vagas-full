import { Router } from "express";
import { searchJobsController } from "../modules/jobs/controllers/searchJobs.controller";

export const jobsRoutes = Router();

/**
 * @swagger
 * /jobs/search:
 * get:
 * summary: Busca vagas em memória RAM no Valkey usando índices invertidos e interseção
 * tags: [Jobs]
 * parameters:
 * - in: query
 * name: keywords
 * schema:
 * type: string
 * description: 'Termos para filtrar (ex: "react,node") separados por vírgula'
 */
jobsRoutes.get("/search", searchJobsController);
