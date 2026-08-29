import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../../../../src/modules/auth/auth.controller";

describe("AuthController", () => {
  let authServiceMock: any;
  let authController: AuthController;
  let reqMock: Partial<Request>;
  let resMock: Partial<Response>;
  let sessionMock: any;
  let sessionsMock: any;

  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "um-password-longo-com-mais-de-32-caracteres");
    vi.stubEnv("FRONTEND_URL", "http://localhost:5173");
    vi.stubEnv("APP_URL", "http://localhost:3001/api");
    vi.clearAllMocks();

    authServiceMock = {
      getAuthUrl: vi.fn().mockResolvedValue("https://provider.com/auth"),
      handleCallback: vi.fn().mockResolvedValue({
        user: { id: "1" },
        session: { userId: "1", role: "user" },
      }),
    };

    sessionsMock = { create: vi.fn().mockResolvedValue({ id: "session_123" }) };
    authController = new AuthController(authServiceMock, sessionsMock);

    sessionMock = {
      save: vi.fn().mockResolvedValue(undefined),
      oauth_state: undefined,
      userId: undefined,
      role: undefined,
      sessionId: undefined,
    };

    reqMock = {
      params: {},
      query: {},
      protocol: "http",
      get: vi.fn().mockReturnValue("localhost:3000"),
      originalUrl: "/auth/callback",
      session: sessionMock,
    };

    resMock = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      redirect: vi.fn().mockReturnThis(),
    };
  });

  describe("getUrl", () => {
    it("deve gerar a URL de autenticação com sucesso e salvar o state na sessão", async () => {
      reqMock.params = { provider: "google" };

      await authController.getUrl(reqMock as Request, resMock as Response);

      expect(sessionMock.oauth_state).toBeDefined();
      expect(typeof sessionMock.oauth_state).toBe("string");
      expect(sessionMock.save).toHaveBeenCalled();
      expect(authServiceMock.getAuthUrl).toHaveBeenCalledWith(
        "google",
        sessionMock.oauth_state,
      );
      expect(resMock.json).toHaveBeenCalledWith({
        url: "https://provider.com/auth",
      });
    });
  });

  describe("callback", () => {
    it("deve redirecionar ao frontend apos callback valido", async () => {
      sessionMock.oauth_state = "state_secreto_123";
      reqMock.params = { provider: "google" };
      reqMock.query = { code: "auth_code_abc", state: "state_secreto_123" };

      await authController.callback(reqMock as Request, resMock as Response);

      expect(sessionMock.oauth_state).toBeUndefined();
      expect(sessionMock.userId).toBe("1");
      expect(sessionMock.role).toBe("user");
      expect(sessionMock.save).toHaveBeenCalled();
      expect(authServiceMock.handleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          code: "auth_code_abc",
          state: "state_secreto_123",
          callbackUrl:
            "http://localhost:3001/api/auth/google/callback?code=auth_code_abc&state=state_secreto_123",
        }),
      );
      expect(resMock.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/auth/callback",
      );
    });

    it("deve redirecionar ao login se o oauth_state estiver ausente na sessão", async () => {
      sessionMock.oauth_state = undefined;
      reqMock.params = { provider: "google" };
      reqMock.query = { code: "code", state: "any_state" };

      await authController.callback(reqMock as Request, resMock as Response);

      expect(resMock.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_state_missing",
      );
    });

    it("deve redirecionar ao login se o state da query for diferente do state da sessão", async () => {
      sessionMock.oauth_state = "state_original";
      reqMock.params = { provider: "google" };
      reqMock.query = { code: "code", state: "state_ataque_csrf" };

      await authController.callback(reqMock as Request, resMock as Response);

      expect(resMock.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_state_invalid",
      );
    });

    it("deve redirecionar ao login com erro se o serviço falhar", async () => {
      sessionMock.oauth_state = "valid_state";
      reqMock.params = { provider: "google" };
      reqMock.query = { code: "code", state: "valid_state" };

      authServiceMock.handleCallback.mockRejectedValue(
        new Error("Falha na comunicação com o provedor"),
      );

      await authController.callback(reqMock as Request, resMock as Response);

      expect(resMock.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=oauth_failed",
      );
    });
  });
});
