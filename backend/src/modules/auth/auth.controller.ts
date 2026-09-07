import { randomBytes } from "crypto";
import { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import type { OAuthProvider } from "../types/auth.types.js";
import { AuthCallbackParamsSchema } from "../types/auth.types.js";
import { linkProviderToUser } from "../users/functions/linkProviderToUser.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions = new SessionService(),
  ) {}

  async getUrl(req: Request, res: Response) {
    const provider = req.params.provider as OAuthProvider;
    const state = randomBytes(16).toString("hex");

    (req.session as { oauth_state?: string }).oauth_state = state;

    if (req.query.intent === "link" && req.session.userId) {
      (req.session as { oauth_intent?: string }).oauth_intent = "link";
    } else {
      delete (req.session as { oauth_intent?: string }).oauth_intent;
    }

    await req.session.save();

    const url = await this.authService.getAuthUrl(provider, state);
    return res.json({ url });
  }

  async callback(req: Request, res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    try {
      const callbackUrl = `${process.env.APP_URL}/auth/${req.params.provider}/callback?${new URLSearchParams(req.query as Record<string, string>).toString()}`;

      const params = AuthCallbackParamsSchema.parse({
        provider: req.params.provider,
        code: req.query.code,
        state: req.query.state,
        callbackUrl,
      });

      const oauthState = (req.session as { oauth_state?: string }).oauth_state;

      if (!oauthState) {
        return res.redirect(`${frontendUrl}/login?error=oauth_state_missing`);
      }

      if (oauthState !== params.state) {
        return res.redirect(`${frontendUrl}/login?error=oauth_state_invalid`);
      }

      delete (req.session as { oauth_state?: string }).oauth_state;

      const intent = (req.session as { oauth_intent?: string }).oauth_intent;
      delete (req.session as { oauth_intent?: string }).oauth_intent;

      if (intent === "link" && req.session.userId) {
        try {
          const profile = await this.authService.getProfileFromProvider({
            ...params,
            callbackUrl,
          });
          await linkProviderToUser({
            userId: req.session.userId,
            provider: params.provider,
            profile,
          });
          await req.session.save();
          return res.redirect(
            `${frontendUrl}/perfil?linked=${params.provider}`,
          );
        } catch (linkError) {
          const code =
            linkError instanceof AppError && linkError.code === "CONFLICT"
              ? "provider_already_linked"
              : "link_failed";
          return res.redirect(`${frontendUrl}/perfil?error=${code}`);
        }
      }

      const result = await this.authService.handleCallback({
        ...params,
        callbackUrl,
      });

      req.session.userId = result.session.userId;
      req.session.role = result.session.role;
      const session = await this.sessions.create(result.session.userId, {
        userAgent: req.get?.("user-agent") ?? undefined,
        ipAddress: req.ip,
      });
      req.session.sessionId = session.id;
      await req.session.save();

      return res.redirect(`${frontendUrl}/auth/callback`);
    } catch (error) {
      console.error("OAuth callback error:", error);
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
}
