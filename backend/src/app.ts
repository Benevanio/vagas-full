import cors from "cors";
import express, { NextFunction, Request, Response, Router } from "express";
import { register } from "./metrics/metrics";
import { corsOptions } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { metricsMiddleware } from "./middleware/metrics";
import { requestIdMiddleware } from "./middleware/requestId";
import { requireAuth } from "./middleware/requireAuth";
import { securityHeaders } from "./middleware/securityHeaders";
import { withSession } from "./middleware/withSession";
import { authRoutes } from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import { jobsRoutes } from "./routes/jobs.routes";
import { keywordsRoutes } from "./routes/keywords.routes";
import { notificationsRoutes } from "./routes/notifications.routes";
import { savedJobsRoutes } from "./routes/savedJobs.routes";
import superAdminRoutes from "./routes/superAdmin.routes";
import supportRoutes from "./routes/support.routes";
import { userRoutes } from "./routes/users.routes";

export function createJobsApiApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);

  // um wrapper para garantir se o CORS chega com erro 403
  app.use((req: Request, res: Response, next: NextFunction) => {
    cors(corsOptions)(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  });

  app.set("trust proxy", 1);

  const apiV1 = Router();
  apiV1.use("/auth", withSession, authRoutes);
  apiV1.use("/users", withSession, requireAuth, userRoutes);
  apiV1.use("/jobs", withSession, requireAuth, jobsRoutes);
  apiV1.use("/keywords", withSession, requireAuth, keywordsRoutes);
  apiV1.use("/notifications", withSession, requireAuth, notificationsRoutes);
  apiV1.use("/saved-jobs", withSession, requireAuth, savedJobsRoutes);
  apiV1.use("/admin", withSession, supportRoutes);
  apiV1.use("/admin", withSession, adminRoutes);
  apiV1.use("/admin", withSession, superAdminRoutes);

  app.use("/api/v1", apiV1);

  // Compatibilidade temporária para clientes ainda não migrados para /api/v1.
  app.use("/auth", withSession, authRoutes);
  app.use("/users", withSession, requireAuth, userRoutes);
  app.use("/jobs", withSession, requireAuth, jobsRoutes);
  app.use("/keywords", withSession, requireAuth, keywordsRoutes);
  app.use("/notifications", withSession, requireAuth, notificationsRoutes);
  app.use("/saved-jobs", withSession, requireAuth, savedJobsRoutes);
  app.use("/admin", withSession, supportRoutes);
  app.use("/admin", withSession, adminRoutes);
  app.use("/admin", withSession, superAdminRoutes);

  const healthHandler = (_req: Request, res: Response) => res.json({ ok: true });
  app.get("/api/v1/health", healthHandler);
  app.get("/health", healthHandler);

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.use(errorHandler);

  return app;
}
