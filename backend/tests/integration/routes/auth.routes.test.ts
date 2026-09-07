import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/lib/errors";

// ── AuthService mock ──────────────────────────────────────────────────────────

const mockAuthService = vi.hoisted(() => ({
  getAuthUrl: vi.fn(),
  handleCallback: vi.fn(),
}));

vi.mock("../../../src/modules/auth/auth.service", () => ({
  AuthService: class {
    constructor() {
      return mockAuthService;
    }
  },
}));

// ── CredentialsService mock ───────────────────────────────────────────────────

const mockCredentialsService = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  findById: vi.fn(), // ← fix: adicionado
}));

vi.mock("../../../src/modules/auth/credentials.service", () => ({
  CredentialsService: class {
    constructor() {
      return mockCredentialsService;
    }
  },
}));

// ── iron-session ──────────────────────────────────────────────────────────────
// AuthController chama getIronSession diretamente.
// CredentialsController usa req.session injetado pelo withSession middleware.
// Mockar iron-session cobre ambos os casos.

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

import { getIronSession } from "iron-session";
import { createJobsApiApp } from "../../../src/app";
import { resetInMemoryRateLimitStore } from "../../../src/middleware/rateLimit";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fixtureOAuthSession = {
  userId: undefined as string | undefined,
  role: undefined as string | undefined,
  oauth_state: "valid-state-abc123",
  save: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
};

const fixtureCredentialsSession = {
  userId: undefined as string | undefined,
  role: undefined as string | undefined,
  save: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
};

const fixtureUser = {
  id: "user-1",
  email: "user@example.com",
  username: "usertest",
  displayName: "User Test",
  role: "user",
};

const registerPayload = {
  email: "novo@example.com",
  password: "Senha@1234",
  name: "Novo Usuario",
};

const loginPayload = {
  email: "user@example.com",
  password: "Senha@1234",
};

// ─────────────────────────────────────────────────────────────────────────────

describe("Integration - Auth Routes", () => {
  let app: ReturnType<typeof createJobsApiApp>;
  const BASE = "/auth";

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryRateLimitStore();
    vi.stubEnv("APP_URL", "http://localhost:3001/api");
    vi.stubEnv("VALKEY_URL", "");
    fixtureCredentialsSession.userId = undefined;
    fixtureCredentialsSession.role = undefined;
    fixtureOAuthSession.userId = undefined;
    fixtureOAuthSession.role = undefined;
    fixtureOAuthSession.oauth_state = "valid-state-abc123";

    // Sessão padrão para rotas OAuth (AuthController)
    vi.mocked(getIronSession).mockResolvedValue({
      ...fixtureOAuthSession,
    } as any);

    // Defaults do AuthService
    mockAuthService.getAuthUrl.mockResolvedValue(
      "https://github.com/login/oauth/authorize?state=valid-state-abc123",
    );
    mockAuthService.handleCallback.mockResolvedValue({
      user: fixtureUser,
      session: { userId: fixtureUser.id, role: fixtureUser.role },
    });

    // Defaults do CredentialsService
    mockCredentialsService.register.mockResolvedValue({
      user: fixtureUser,
      session: { userId: fixtureUser.id, role: fixtureUser.role },
    });
    mockCredentialsService.login.mockResolvedValue({
      user: fixtureUser,
      session: { userId: fixtureUser.id, role: fixtureUser.role },
    });

    mockCredentialsService.findById.mockResolvedValue(fixtureUser);

    app = createJobsApiApp();
  });

  // ── GET /:provider/url ────────────────────────────────────────────────────

  describe("GET /:provider/url", () => {
    it("retorna 200 e url para github", async () => {
      const res = await request(app).get(`${BASE}/github/url`).expect(200);

      expect(res.body).toHaveProperty("url");
      expect(res.body.url).toContain("github.com");
    });

    it("retorna 200 e url para google", async () => {
      mockAuthService.getAuthUrl.mockResolvedValueOnce(
        "https://accounts.google.com/o/oauth2/auth?state=abc",
      );

      const res = await request(app).get(`${BASE}/google/url`).expect(200);

      expect(res.body.url).toContain("google.com");
    });

    it("retorna 200 e url para linkedin", async () => {
      mockAuthService.getAuthUrl.mockResolvedValueOnce(
        "https://www.linkedin.com/oauth/v2/authorization?state=abc",
      );

      const res = await request(app).get(`${BASE}/linkedin/url`).expect(200);

      expect(res.body.url).toContain("linkedin.com");
    });

    it("salva oauth_state na sessão antes de retornar a url", async () => {
      // getIronSession é chamado duas vezes: pelo withSession (app.use) e pelo
      // AuthController.getUrl diretamente. mockResolvedValue cobre ambas as chamadas.
      const session = {
        oauth_state: undefined as string | undefined,
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getIronSession).mockResolvedValue(session as any);

      await request(app).get(`${BASE}/github/url`).expect(200);

      expect(session.save).toHaveBeenCalled();
      expect(typeof session.oauth_state).toBe("string");
      expect(session.oauth_state).toHaveLength(32);
    });

    it("retorna 400 para provider inválido (ZodError)", async () => {
      const res = await request(app).get(`${BASE}/twitter/url`).expect(400);

      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
      });
      expect(res.body.details).toHaveProperty("provider");
    });

    it("retorna 500 quando getAuthUrl lança erro", async () => {
      mockAuthService.getAuthUrl.mockRejectedValueOnce(
        new Error("OAuth config ausente"),
      );

      const res = await request(app).get(`${BASE}/github/url`).expect(500);

      expect(res.body).toMatchObject({
        code: "INTERNAL_ERROR",
        message: "Erro interno.",
      });
    });
  });

  // ── GET /:provider/callback ───────────────────────────────────────────────

  describe("GET /:provider/callback", () => {
    it("redireciona ao frontend em callback valido", async () => {
      const res = await request(app)
        .get(`${BASE}/github/callback?code=abc123&state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain("/auth/callback");
    });

    it("chama handleCallback com os params corretos", async () => {
      await request(app).get(
        `${BASE}/github/callback?code=abc123&state=valid-state-abc123`,
      );

      expect(mockAuthService.handleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "github",
          code: "abc123",
          state: "valid-state-abc123",
        }),
      );
    });

    it("apaga oauth_state da sessao apos callback bem-sucedido", async () => {
      const session = {
        oauth_state: "valid-state-abc123",
        save: vi.fn().mockResolvedValue(undefined),
        userId: undefined as string | undefined,
        role: undefined as string | undefined,
      };
      vi.mocked(getIronSession).mockResolvedValue(session as any);

      await request(app)
        .get(`${BASE}/github/callback?code=abc123&state=valid-state-abc123`)
        .expect(302);

      expect(session.oauth_state).toBeUndefined();
      expect(session.userId).toBe(fixtureUser.id);
      expect(session.role).toBe(fixtureUser.role);
      expect(session.save).toHaveBeenCalled();
    });

    it("redireciona ao login quando oauth_state da sessao esta ausente", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        oauth_state: undefined,
        save: vi.fn(),
      } as any);

      const res = await request(app)
        .get(`${BASE}/github/callback?code=abc123&state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain(
        "/login?error=oauth_state_missing",
      );
    });

    it("redireciona ao login quando state do query nao confere com o da sessao", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        oauth_state: "outro-state",
        save: vi.fn(),
      } as any);

      const res = await request(app)
        .get(`${BASE}/github/callback?code=abc123&state=state-errado`)
        .expect(302);

      expect(res.headers.location).toContain(
        "/login?error=oauth_state_invalid",
      );
    });

    it("redireciona ao login para provider invalido nos params", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        oauth_state: "valid-state-abc123",
        save: vi.fn(),
      } as any);

      const res = await request(app)
        .get(`${BASE}/twitter/callback?code=abc&state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain("/login?error=oauth_failed");
    });

    it("redireciona ao login quando code esta ausente", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        oauth_state: "valid-state-abc123",
        save: vi.fn(),
      } as any);

      const res = await request(app)
        .get(`${BASE}/github/callback?state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain("/login?error=oauth_failed");
    });

    it("redireciona ao login quando handleCallback lanca erro", async () => {
      mockAuthService.handleCallback.mockRejectedValueOnce(
        new Error("upstream OAuth error"),
      );

      const res = await request(app)
        .get(`${BASE}/github/callback?code=abc123&state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain("/login?error=oauth_failed");
    });

    it("redireciona ao frontend em callback valido para linkedin", async () => {
      const res = await request(app)
        .get(
          `${BASE}/linkedin/callback?code=li-code-123&state=valid-state-abc123`,
        )
        .expect(302);

      expect(res.headers.location).toContain("/auth/callback");
      expect(mockAuthService.handleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "linkedin",
          code: "li-code-123",
          state: "valid-state-abc123",
        }),
      );
    });

    it("redireciona com erro quando profile nao tem email", async () => {
      mockAuthService.handleCallback.mockRejectedValueOnce(
        new Error("oauth_email_required"),
      );

      const res = await request(app)
        .get(`${BASE}/linkedin/callback?code=abc123&state=valid-state-abc123`)
        .expect(302);

      expect(res.headers.location).toContain("/login?error=oauth_failed");
    });
  });

  // ── POST /register ────────────────────────────────────────────────────────

  describe("POST /register", () => {
    it("cria usuario e retorna 201", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      const res = await request(app)
        .post(`${BASE}/register`)
        .send(registerPayload)
        .expect(201);

      expect(res.body).toHaveProperty("user");
      expect(res.body.user).toHaveProperty("email", fixtureUser.email);
      expect(fixtureCredentialsSession.userId).toBe(fixtureUser.id);
      expect(fixtureCredentialsSession.role).toBe(fixtureUser.role);
    });

    it("chama register com email, password e name", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      await request(app).post(`${BASE}/register`).send(registerPayload);

      expect(mockCredentialsService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerPayload.email,
          password: registerPayload.password,
          name: registerPayload.name,
        }),
      );
    });

    it("retorna 400 para email invalido (ZodError)", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      const res = await request(app)
        .post(`${BASE}/register`)
        .send({ ...registerPayload, email: "nao-e-email" })
        .expect(400);

      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
      });
      expect(res.body.details).toHaveProperty("email");
    });

    it("retorna 400 para senha curta (ZodError)", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      await request(app)
        .post(`${BASE}/register`)
        .send({ ...registerPayload, password: "123" })
        .expect(400);
    });

    it("retorna 409 quando email ja esta cadastrado", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );
      mockCredentialsService.register.mockRejectedValueOnce(
        AppError.conflict("Email já cadastrado"),
      );

      const res = await request(app)
        .post(`${BASE}/register`)
        .send(registerPayload)
        .expect(409);

      expect(res.body).toEqual({
        code: "CONFLICT",
        message: "Email já cadastrado",
      });
    });

    it("retorna 500 para erro inesperado no register", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );
      mockCredentialsService.register.mockRejectedValueOnce(
        new Error("db connection failed"),
      );

      await request(app)
        .post(`${BASE}/register`)
        .send(registerPayload)
        .expect(500);
    });

    it("bloqueia cadastros repetidos para o mesmo email com 429", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app)
          .post(`${BASE}/register`)
          .send(registerPayload)
          .expect(201);
      }

      const res = await request(app)
        .post(`${BASE}/register`)
        .send(registerPayload)
        .expect(429);

      expect(res.body).toHaveProperty(
        "error",
        "Muitas tentativas. Tente novamente mais tarde.",
      );
      expect(res.headers["retry-after"]).toBeDefined();
      expect(mockCredentialsService.register).toHaveBeenCalledTimes(5);
    });
  });

  // ── POST /login ───────────────────────────────────────────────────────────

  describe("POST /login", () => {
    it("autentica e retorna 200 com user e session", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      const res = await request(app)
        .post(`${BASE}/login`)
        .send(loginPayload)
        .expect(200);

      expect(res.body).toHaveProperty("user");
      expect(res.body.user).toHaveProperty("id", fixtureUser.id);
      expect(fixtureCredentialsSession.userId).toBe(fixtureUser.id);
      expect(fixtureCredentialsSession.role).toBe(fixtureUser.role);
    });

    it("chama login com email e password corretos", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      await request(app).post(`${BASE}/login`).send(loginPayload);

      expect(mockCredentialsService.login).toHaveBeenCalledWith(
        expect.objectContaining(loginPayload),
      );
    });

    it("retorna 400 para email invalido (ZodError)", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      await request(app)
        .post(`${BASE}/login`)
        .send({ email: "invalido", password: "Senha@1234" })
        .expect(400);
    });

    it("retorna 400 para senha ausente (ZodError)", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      await request(app)
        .post(`${BASE}/login`)
        .send({ email: "user@example.com" })
        .expect(400);
    });

    it("retorna 401 para credenciais invalidas", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );
      mockCredentialsService.login.mockRejectedValueOnce(
        AppError.unauthorized("Credenciais inválidas"),
      );

      const res = await request(app)
        .post(`${BASE}/login`)
        .send(loginPayload)
        .expect(401);

      expect(res.body).toEqual({
        code: "UNAUTHORIZED",
        message: "Credenciais inválidas",
      });
    });

    it("retorna 500 para erro inesperado no login", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );
      mockCredentialsService.login.mockRejectedValueOnce(
        new Error("db timeout"),
      );

      await request(app).post(`${BASE}/login`).send(loginPayload).expect(500);
    });

    it("bloqueia muitas tentativas para a mesma conta", async () => {
      vi.mocked(getIronSession).mockResolvedValue(
        fixtureCredentialsSession as any,
      );

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app).post(`${BASE}/login`).send(loginPayload).expect(200);
      }

      const res = await request(app)
        .post(`${BASE}/login`)
        .send(loginPayload)
        .expect(429);

      expect(res.body).toHaveProperty(
        "error",
        "Muitas tentativas. Tente novamente mais tarde.",
      );
      expect(res.headers["retry-after"]).toBeDefined();
    });
  });

  // ── POST /logout ──────────────────────────────────────────────────────────

  describe("POST /logout", () => {
    it("destroi a sessao e retorna ok: true", async () => {
      const session = {
        userId: "user-1",
        destroy: vi.fn().mockResolvedValue(undefined),
        save: vi.fn(),
      };
      vi.mocked(getIronSession).mockResolvedValue(session as any);

      const res = await request(app).post(`${BASE}/logout`).expect(200);

      expect(res.body).toEqual({ ok: true });
      expect(session.destroy).toHaveBeenCalled();
    });

    it("funciona mesmo sem usuario autenticado", async () => {
      const session = {
        userId: undefined,
        destroy: vi.fn().mockResolvedValue(undefined),
        save: vi.fn(),
      };
      vi.mocked(getIronSession).mockResolvedValue(session as any);

      const res = await request(app).post(`${BASE}/logout`).expect(200);

      expect(res.body).toEqual({ ok: true });
    });
  });

  // ── GET /me ───────────────────────────────────────────────────────────────

  describe("GET /me", () => {
    it("retorna user completo quando autenticado", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        userId: "user-1",
        save: vi.fn(),
        destroy: vi.fn(),
      } as any);

      const res = await request(app).get(`${BASE}/me`).expect(200);

      expect(res.body).toHaveProperty("user");
      expect(res.body.user).toHaveProperty("id", fixtureUser.id);
      expect(res.body.user).toHaveProperty("email", fixtureUser.email);
    });

    it("retorna 401 quando nao autenticado", async () => {
      vi.mocked(getIronSession).mockResolvedValue({
        userId: undefined,
        save: vi.fn(),
      } as any);

      const res = await request(app).get(`${BASE}/me`).expect(401);

      expect(res.body).toEqual({
        code: "UNAUTHORIZED",
        message: "Não autenticado.",
      });
    });
  });
});
