import { Router } from "express";
import { z } from "zod";
import {
    authAccountRateLimiter,
    authIpRateLimiter,
    authRegisterRateLimiter,
} from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { AuthController } from "../modules/auth/auth.controller";
import { AuthService } from "../modules/auth/auth.service";
import { ConnectionsController } from "../modules/auth/connections.controller";
import { CredentialsController } from "../modules/auth/credentials.controller";
import { CredentialsService } from "../modules/auth/credentials.service";
import { OAuthProviderSchema } from "../modules/types/auth.types";
import {
    LoginSchema,
    RegisterSchema,
} from "../modules/types/credentials.types";

const router = Router();

const authService = new AuthService();
const authController = new AuthController(authService);
const credentialsService = new CredentialsService();
const credentialsController = new CredentialsController(credentialsService);
const connectionsController = new ConnectionsController();

const providerParamsSchema = z.object({
  provider: OAuthProviderSchema,
});

// OAuth
router.get(
  "/:provider/url",
  validate({ params: providerParamsSchema }),
  (req, res, next) => {
    authController.getUrl(req, res).catch(next);
  },
);
router.get("/:provider/callback", (req, res, next) => {
  authController.callback(req, res).catch(next);
});

// Connections (usuário logado)
router.get("/connections", requireAuth, (req, res, next) => {
  connectionsController.list(req, res).catch(next);
});
router.delete("/connections/:provider", requireAuth, (req, res, next) => {
  connectionsController.disconnect(req, res).catch(next);
});

// Credentials
router.post(
  "/register",
  authIpRateLimiter,
  authRegisterRateLimiter,
  validate({ body: RegisterSchema }),
  (req, res, next) => {
    credentialsController.register(req, res).catch(next);
  },
);
router.post(
  "/login",
  authIpRateLimiter,
  authAccountRateLimiter,
  validate({ body: LoginSchema }),
  (req, res, next) => {
    credentialsController.login(req, res).catch(next);
  },
);
router.post("/logout", (req, res, next) => {
  credentialsController.logout(req, res).catch(next);
});
router.get("/me", (req, res, next) => {
  credentialsController.me(req, res).catch(next);
});

export { router as authRoutes };

