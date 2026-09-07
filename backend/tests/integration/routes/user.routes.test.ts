import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── UsersService mock ─────────────────────────────────────────────────────────

const mockUsersService = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateProfile: vi.fn(),
  getPreferences: vi.fn(),
  createPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));
const mockPrivacyService = vi.hoisted(() => ({
  exportUserData: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../../../src/modules/users/users.service", () => ({
  UsersService: class {
    constructor() {
      return mockUsersService;
    }
  },
}));
vi.mock("../../../src/modules/users/privacy.service", () => ({
  PrivacyService: class {
    constructor() {
      return mockPrivacyService;
    }
  },
}));

// ── iron-session ──────────────────────────────────────────────────────────────
// O UsersController chama getIronSession diretamente no método getSession(),
// além do withSession middleware no app.ts. Mockar o pacote cobre ambos.

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

import { getIronSession } from "iron-session";
import { createJobsApiApp } from "../../../src/app";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fixtureSession = {
  userId: "user_abc",
  save: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
};

const fixtureUser = {
  id: "user_abc",
  username: "hudson",
  email: "hudson@teste.com",
  displayName: "Hudson Tavares",
};

const fixturePreferences = {
  userId: "user_abc",
  remoteOnly: true,
  emailNotifications: false,
};

// Payload válido para POST/PATCH /preferences (campos do updatePreferencesSchema)
const preferencesPayload = {
  remoteOnly: true,
  emailNotifications: false,
  searchLocation: "São Paulo",
};

// ─────────────────────────────────────────────────────────────────────────────

describe("Integration - Users Routes", () => {
  let app: ReturnType<typeof createJobsApiApp>;
  const BASE = "/users";

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getIronSession).mockResolvedValue(fixtureSession as any);

    mockUsersService.getUserById.mockResolvedValue(fixtureUser);
    mockUsersService.updateProfile.mockResolvedValue({
      ...fixtureUser,
      displayName: "Hudson Alterado",
    });
    mockUsersService.getPreferences.mockResolvedValue(fixturePreferences);
    mockUsersService.createPreferences.mockResolvedValue({
      id: "pref_1",
      userId: "user_abc",
      ...preferencesPayload,
    });
    mockUsersService.updatePreferences.mockResolvedValue({
      userId: "user_abc",
      remoteOnly: false,
    });
    mockPrivacyService.exportUserData.mockResolvedValue({ profile: fixtureUser });
    mockPrivacyService.deleteAccount.mockResolvedValue(undefined);

    app = createJobsApiApp();
  });

  // ── GET /profile ──────────────────────────────────────────────────────────

  describe("GET /profile", () => {
    it("retorna 200 e os dados do perfil", async () => {
      const res = await request(app).get(`${BASE}/profile`).expect(200);

      expect(res.body).toHaveProperty("email", "hudson@teste.com");
    });

    it("chama getUserById com o userId da sessão", async () => {
      await request(app).get(`${BASE}/profile`);

      expect(mockUsersService.getUserById).toHaveBeenCalledWith("user_abc");
    });

    it("retorna 404 quando usuário não existe", async () => {
      mockUsersService.getUserById.mockResolvedValueOnce(undefined);

      await request(app).get(`${BASE}/profile`).expect(404);
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app).get(`${BASE}/profile`).expect(401);
    });
  });

  describe("dados e exclusão de conta", () => {
    it("exporta somente os dados do usuário autenticado", async () => {
      const res = await request(app).get(`${BASE}/export`).expect(200);
      expect(res.headers["content-disposition"]).toContain("meus-dados.json");
      expect(res.body).toEqual({ profile: fixtureUser });
      expect(mockPrivacyService.exportUserData).toHaveBeenCalledWith("user_abc");
    });

    it("exige confirmação explícita e encerra a sessão ao excluir", async () => {
      await request(app).delete(`${BASE}/account`).send({}).expect(400);
      await request(app)
        .delete(`${BASE}/account`)
        .send({ confirmation: "EXCLUIR" })
        .expect(204);
      expect(mockPrivacyService.deleteAccount).toHaveBeenCalledWith("user_abc");
      expect(fixtureSession.destroy).toHaveBeenCalled();
    });
  });

  // ── PATCH /profile ────────────────────────────────────────────────────────

  describe("PATCH /profile", () => {
    const profilePayload = { displayName: "Hudson Alterado" };

    it("retorna 200 e o perfil atualizado", async () => {
      const res = await request(app)
        .patch(`${BASE}/profile`)
        .send(profilePayload)
        .expect(200);

      expect(res.body).toHaveProperty("displayName", "Hudson Alterado");
    });

    it("chama updateProfile com userId e body parseado pelo Zod", async () => {
      await request(app).patch(`${BASE}/profile`).send(profilePayload);

      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        "user_abc",
        expect.objectContaining({ displayName: "Hudson Alterado" }),
      );
    });

    it("retorna 400 para campo inválido (username com caracteres proibidos)", async () => {
      const res = await request(app)
        .patch(`${BASE}/profile`)
        .send({ username: "UPPER CASE!" })
        .expect(400);

      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
      });
      expect(res.body.details).toHaveProperty("username");
    });

    it("retorna 500 quando updateProfile lança erro", async () => {
      mockUsersService.updateProfile.mockRejectedValueOnce(
        new Error("db error"),
      );

      await request(app)
        .patch(`${BASE}/profile`)
        .send(profilePayload)
        .expect(500);
    });
  });

  // ── GET /preferences ──────────────────────────────────────────────────────

  describe("GET /preferences", () => {
    it("retorna 200 e as preferências", async () => {
      const res = await request(app).get(`${BASE}/preferences`).expect(200);

      expect(res.body).toHaveProperty("remoteOnly", true);
    });

    it("retorna 404 quando preferências não existem", async () => {
      mockUsersService.getPreferences.mockResolvedValueOnce(undefined);

      await request(app).get(`${BASE}/preferences`).expect(404);
    });
  });

  // ── POST /preferences ─────────────────────────────────────────────────────

  describe("POST /preferences", () => {
    it("cria preferências e retorna 201", async () => {
      const res = await request(app)
        .post(`${BASE}/preferences`)
        .send(preferencesPayload)
        .expect(201);

      expect(res.body).toHaveProperty("userId", "user_abc");
    });

    it("chama createPreferences com userId e body parseado pelo Zod", async () => {
      await request(app).post(`${BASE}/preferences`).send(preferencesPayload);

      expect(mockUsersService.createPreferences).toHaveBeenCalledWith(
        "user_abc",
        expect.objectContaining({
          remoteOnly: true,
          searchLocation: "São Paulo",
        }),
      );
    });

    it("cria preferências com body vazio (todos os campos são opcionais)", async () => {
      await request(app).post(`${BASE}/preferences`).send({}).expect(201);

      expect(mockUsersService.createPreferences).toHaveBeenCalledWith(
        "user_abc",
        {},
      );
    });
  });

  // ── PATCH /preferences ────────────────────────────────────────────────────

  describe("PATCH /preferences", () => {
    const updatePayload = { remoteOnly: false, emailNotifications: true };

    it("retorna 200 e as preferências atualizadas", async () => {
      const res = await request(app)
        .patch(`${BASE}/preferences`)
        .send(updatePayload)
        .expect(200);

      expect(res.body).toHaveProperty("remoteOnly", false);
    });

    it("chama updatePreferences com userId e body parseado pelo Zod", async () => {
      await request(app).patch(`${BASE}/preferences`).send(updatePayload);

      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(
        "user_abc",
        expect.objectContaining({
          remoteOnly: false,
          emailNotifications: true,
        }),
      );
    });

    it("descarta campos desconhecidos (Zod strip)", async () => {
      await request(app)
        .patch(`${BASE}/preferences`)
        .send({ remoteOnly: false, campoInexistente: "foo" });

      const called = mockUsersService.updatePreferences.mock.calls[0][1];
      expect(called).not.toHaveProperty("campoInexistente");
    });

    it("retorna 500 quando updatePreferences lança erro", async () => {
      mockUsersService.updatePreferences.mockRejectedValueOnce(
        new Error("not found"),
      );

      await request(app)
        .patch(`${BASE}/preferences`)
        .send(updatePayload)
        .expect(500);
    });
  });
});
