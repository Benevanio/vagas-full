import { Router } from "express";
import { searchJobsController } from "../modules/jobs/controllers/searchJobs.controller";

export const jobsRoutes = Router();

jobsRoutes.get("/search", searchJobsController);
