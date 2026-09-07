import { eq } from "drizzle-orm";
import { Request, Response } from "express";
import { db } from "../../db/client";
import { userPreferences } from "../../db/schema";
import { verifyUnsubscribeToken } from "../../lib/security/unsubscribeToken";

export class NewsletterController {
  /**
   * POST /newsletter/unsubscribe — desativa `emailNotifications` sem exigir
   * sessão. Token inválido/adulterado ou de usuário sem preferências (ex.:
   * excluído via LGPD) responde o mesmo `{ ok: false }`, sem distinguir o
   * motivo — nunca revela se o usuário existe (NEWSL-13, NEWSL-14).
   */
  async unsubscribe(req: Request, res: Response) {
    const { token } = req.body as { token: string };
    const userId = verifyUnsubscribeToken(token);

    if (!userId) {
      return res.json({ ok: false });
    }

    const updated = await db
      .update(userPreferences)
      .set({ emailNotifications: false, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();

    return res.json({ ok: updated.length > 0 });
  }
}
