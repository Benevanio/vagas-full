import { Request, Response } from "express";
import { getIronSession } from "iron-session";
import { AppError } from "../../lib/errors";
import { sessionOptions } from "../../lib/session";
import { Session } from "../types/auth.types";
import { UsersService } from "./users.service";
import { EmailChangeService } from "./emailChange.service";

export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailChangeService = new EmailChangeService(),
  ) {}

  private async getSession(req: Request, res: Response) {
    return getIronSession<Session>(req, res, sessionOptions);
  }

  private async requireUserId(req: Request, res: Response): Promise<string> {
    const session = await this.getSession(req, res);
    if (!session.userId) {
      throw AppError.unauthorized();
    }
    return session.userId;
  }

  // GET /api/users/profile
  async getProfile(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    const user = await this.usersService.getUserById(userId);
    if (!user) {
      throw AppError.notFound("Usuário não encontrado");
    }
    return res.json(user);
  }

  // PATCH /api/users/profile
  async updateProfile(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    const updated = await this.usersService.updateProfile(userId, req.body);
    return res.json(updated);
  }

  async requestEmailChange(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    await this.emailChangeService.request(userId, req.body.email);
    return res.status(204).end();
  }

  // GET /api/users/preferences
  async getPreferences(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    const prefs = await this.usersService.getPreferences(userId);
    if (!prefs) {
      throw AppError.notFound("Preferências não encontradas");
    }
    return res.json(prefs);
  }

  // POST /api/users/preferences
  async createPreferences(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    const prefs = await this.usersService.createPreferences(userId, req.body);
    return res.status(201).json(prefs);
  }

  // PATCH /api/users/preferences
  async updatePreferences(req: Request, res: Response) {
    const userId = await this.requireUserId(req, res);
    const updated = await this.usersService.updatePreferences(
      userId,
      req.body,
    );
    return res.json(updated);
  }
}
