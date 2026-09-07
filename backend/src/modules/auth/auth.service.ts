import { logError } from "../../logger";
import type { PublicUser } from "../users/users.mapper";
import { emailService } from "../email/email.service";
import type {
  AuthCallbackParams,
  OAuthProfile,
  OAuthProvider,
  Session,
} from "../types/auth.types";
import { findOrCreateUser } from "../users/functions/findOrCreateUser";
import { providers } from "./providers/auth.provider";

export class AuthService {
  async getAuthUrl(provider: OAuthProvider, state: string): Promise<string> {
    const providerImpl = providers[provider];

    if (!providerImpl) {
      throw new Error("Provider inválido");
    }

    return providerImpl.getAuthUrl(state);
  }

  async handleCallback({
    provider,
    code,
    state,
    callbackUrl,
  }: AuthCallbackParams): Promise<{
    user: PublicUser;
    session: Session;
  }> {
    const profile = await this.getProfileFromProvider({
      provider,
      code,
      state,
      callbackUrl,
    });

    if (!profile.email) {
      throw new Error("oauth_email_required");
    }

    const { user, isNewUser } = await findOrCreateUser({
      provider,
      profile,
    });

    // Boas-vindas apenas no primeiro login social (usuário recém-criado).
    if (isNewUser) {
      await this.sendWelcomeEmail(user);
    }

    const session = await this.createSession(user);

    return {
      user,
      session,
    };
  }

  /**
   * Dispara o e-mail de boas-vindas para um usuário recém-criado via login
   * social. Falha nunca derruba o login (EMAIL-08): erro é apenas logado.
   */
  private async sendWelcomeEmail(user: PublicUser): Promise<void> {
    if (!user.email) return;

    try {
      await emailService.sendWelcome({
        email: user.email,
        name: user.displayName ?? user.username ?? "Usuário",
      });
    } catch (error) {
      logError("Falha ao disparar e-mail de boas-vindas no login social.", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getProfileFromProvider({
    provider,
    code,
    state,
    callbackUrl,
  }: AuthCallbackParams): Promise<OAuthProfile> {
    const providerImpl = providers[provider];

    if (!providerImpl) {
      throw new Error("Provider inválido");
    }

    return providerImpl.exchangeCode({
      code,
      state,
      callbackUrl,
    });
  }

  async createSession(user: {
    id: string;
    role: PublicUser["role"];
  }): Promise<Session> {
    return {
      userId: user.id,
      role: user.role,
    };
  }
}
