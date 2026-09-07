import { Request, Response } from "express";
import { getIronSession } from "iron-session";
import { AppError } from "../../lib/errors";
import { sessionOptions } from "../../lib/session";
import { Session } from "../types/auth.types";
import { ApplicationNotesService } from "./applicationNotes.service";

export class ApplicationNotesController {
  constructor(private readonly service: ApplicationNotesService) {}

  private async userId(req: Request, res: Response): Promise<string> {
    const session = await getIronSession<Session>(req, res, sessionOptions);
    if (!session.userId) throw AppError.unauthorized();
    return session.userId;
  }

  async list(req: Request, res: Response) {
    return res.json(await this.service.list(await this.userId(req, res), req.params.id as string));
  }
  async create(req: Request, res: Response) {
    return res.status(201).json(await this.service.create(await this.userId(req, res), req.params.id as string, req.body.content));
  }
  async update(req: Request, res: Response) {
    return res.json(await this.service.update(await this.userId(req, res), req.params.id as string, req.params.noteId as string, req.body.content));
  }
  async delete(req: Request, res: Response) {
    await this.service.delete(await this.userId(req, res), req.params.id as string, req.params.noteId as string);
    return res.status(204).send();
  }
}
