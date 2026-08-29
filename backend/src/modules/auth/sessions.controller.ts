import { Request, Response } from "express";
import { AppError } from "../../lib/errors";
import { SessionService } from "./session.service";

export class SessionsController {
  constructor(private readonly sessions = new SessionService()) {}

  async list(req: Request, res: Response) {
    const sessions = await this.sessions.list(
      req.session.userId as string,
      req.session.sessionId,
    );
    return res.json({ sessions });
  }

  async revoke(req: Request, res: Response) {
    const userId = req.session.userId as string;
    const sessionId = req.params.sessionId;
    const revoked = await this.sessions.revoke(userId, sessionId);
    if (!revoked) throw AppError.notFound("Sessão não encontrada.");

    const currentSessionRevoked = sessionId === req.session.sessionId;
    if (currentSessionRevoked) await req.session.destroy();
    return res.json({ ok: true, currentSessionRevoked });
  }

  async revokeOthers(req: Request, res: Response) {
    const revokedCount = await this.sessions.revokeOthers(
      req.session.userId as string,
      req.session.sessionId,
    );
    return res.json({ ok: true, revokedCount });
  }
}
