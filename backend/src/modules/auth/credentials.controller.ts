import { Request, Response } from "express";
import { AppError } from "../../lib/errors";
import { CredentialsService } from "./credentials.service";
import { SessionService } from "./session.service";

export class CredentialsController {
  constructor(
    private readonly service: CredentialsService,
    private readonly sessions = new SessionService(),
  ) {}

  private async establishSession(req: Request, userId: string) {
    const session = await this.sessions.create(userId, {
      userAgent: req.get?.("user-agent") ?? undefined,
      ipAddress: req.ip,
    });
    req.session.sessionId = session.id;
  }

  async register(req: Request, res: Response) {
    const { user, session: userSession } = await this.service.register(
      req.body,
    );

    req.session.userId = userSession.userId;
    req.session.role = userSession.role;
    await this.establishSession(req, userSession.userId);
    await req.session.save();

    return res.status(201).json({ user, session: userSession });
  }

  async login(req: Request, res: Response) {
    const { user, session: userSession } = await this.service.login(req.body);

    req.session.userId = userSession.userId;
    req.session.role = userSession.role;
    await this.establishSession(req, userSession.userId);
    await req.session.save();

    return res.json({ user, session: userSession });
  }

  async logout(req: Request, res: Response) {
    if (req.session.userId && req.session.sessionId) {
      await this.sessions.revoke(req.session.userId, req.session.sessionId);
    }
    await req.session.destroy();
    return res.json({ ok: true });
  }

  async me(req: Request, res: Response) {
    if (!req.session.userId) {
      throw AppError.unauthorized();
    }

    const user = await this.service.findById(req.session.userId);
    if (!user) {
      await req.session.destroy();
      throw AppError.unauthorized();
    }

    return res.json({ user });
  }
}
