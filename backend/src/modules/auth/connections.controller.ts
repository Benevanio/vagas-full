// backend/src/modules/auth/connections.controller.ts
import { Request, Response } from "express";
import { AppError } from "../../lib/errors";
import { disconnectProvider } from "../users/functions/disconnectProvider";
import {
  listUserConnections,
  SUPPORTED_PROVIDERS,
} from "../users/functions/listUserConnections";

export class ConnectionsController {
  async list(req: Request, res: Response) {
    const userId = req.session.userId as string;
    const result = await listUserConnections(userId);
    return res.json(result);
  }

  async disconnect(req: Request, res: Response) {
    const userId = req.session.userId as string;
    const provider = req.params.provider;

    if (
      typeof provider !== "string" ||
      !(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)
    ) {
      throw AppError.validation("Provider inválido.");
    }

    await disconnectProvider({ userId, provider });
    return res.json({ ok: true });
  }
}
