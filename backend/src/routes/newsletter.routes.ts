import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { NewsletterController } from "../modules/newsletter/newsletter.controller";

const router = Router();
const newsletterController = new NewsletterController();

const unsubscribeSchema = z.object({
  token: z.string().min(1),
});

// Rota pública — sem withSession/requireAuth (token-autenticada, ver app.ts).
router.post(
  "/unsubscribe",
  validate({ body: unsubscribeSchema }),
  (req, res, next) => {
    newsletterController.unsubscribe(req, res).catch(next);
  },
);

export { router as newsletterRoutes };
