import type { NextFunction, Request, Response } from "express";
import { getIronSession } from "iron-session";
import { UserRole } from "../db/schema/users";
import { sessionOptions } from "../lib/session";
import { SessionService } from "../modules/auth/session.service";

export interface SessionData {
  userId?: string;
  role?: UserRole;
  sessionId?: string;
}

declare module "express-serve-static-core" {
  interface Request {
    session: Awaited<ReturnType<typeof getIronSession<SessionData>>>;
  }
}

export async function withSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (req.session.userId) {
    if (!req.session.sessionId) {
      // Cookie emitido antes desta feature: não tem registro em
      // `user_sessions`, então não aparece na listagem de sessões ativas e
      // não pode ser revogado. Deixar passar abriria um buraco justamente na
      // garantia que a feature promete, então invalidamos — o usuário faz
      // login de novo e passa a ter uma sessão rastreável.
      await req.session.destroy();
    } else {
      const isValid = await new SessionService().isActive(
        req.session.userId,
        req.session.sessionId,
      );
      if (!isValid) await req.session.destroy();
    }
  }

  next();
}
