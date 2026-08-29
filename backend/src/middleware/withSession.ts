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
  if (req.session.userId && req.session.sessionId) {
    const isValid = await new SessionService().isActive(
      req.session.userId,
      req.session.sessionId,
    );
    if (!isValid) await req.session.destroy();
  }
  next();
}
