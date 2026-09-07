import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── db/client mock ────────────────────────────────────────────────────────────

const dbMocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where, returning };
});

vi.mock("../../../src/db/client", () => ({
  db: { update: dbMocks.update },
}));

// ── unsubscribeToken mock ────────────────────────────────────────────────────

const tokenMocks = vi.hoisted(() => ({
  verifyUnsubscribeToken: vi.fn(),
}));

vi.mock("../../../src/lib/security/unsubscribeToken", () => ({
  verifyUnsubscribeToken: tokenMocks.verifyUnsubscribeToken,
}));

import { createJobsApiApp } from "../../../src/app";

// ─────────────────────────────────────────────────────────────────────────────

describe("Integration - Newsletter Routes", () => {
  let app: ReturnType<typeof createJobsApiApp>;
  const BASE = "/newsletter";

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.returning.mockResolvedValue([{ userId: "user-1" }]);
    app = createJobsApiApp();
  });

  describe("POST /unsubscribe", () => {
    it("token válido → seta emailNotifications=false e responde {ok:true} (NEWSL-13)", async () => {
      tokenMocks.verifyUnsubscribeToken.mockReturnValue("user-1");

      const res = await request(app)
        .post(`${BASE}/unsubscribe`)
        .send({ token: "valid-token" })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
      expect(dbMocks.set).toHaveBeenCalledWith(
        expect.objectContaining({ emailNotifications: false }),
      );
    });

    it("token malformado/adulterado → responde {ok:false}, nunca 404/mensagem que revele existência do usuário (NEWSL-14)", async () => {
      tokenMocks.verifyUnsubscribeToken.mockReturnValue(null);

      const res = await request(app)
        .post(`${BASE}/unsubscribe`)
        .send({ token: "tampered-token" })
        .expect(200);

      expect(res.body).toEqual({ ok: false });
      expect(dbMocks.update).not.toHaveBeenCalled();
    });

    it("token válido de usuário sem preferências (ex.: excluído via LGPD) → responde {ok:false}, mesmo shape do token inválido (NEWSL-14)", async () => {
      tokenMocks.verifyUnsubscribeToken.mockReturnValue("deleted-user");
      dbMocks.returning.mockResolvedValueOnce([]);

      const res = await request(app)
        .post(`${BASE}/unsubscribe`)
        .send({ token: "token-of-deleted-user" })
        .expect(200);

      expect(res.body).toEqual({ ok: false });
    });

    it("rota acessível sem cookie de sessão (nenhum requireAuth/withSession no caminho)", async () => {
      tokenMocks.verifyUnsubscribeToken.mockReturnValue("user-1");

      const res = await request(app)
        .post(`${BASE}/unsubscribe`)
        .send({ token: "valid-token" });

      // Nenhum cookie de sessão foi enviado e ainda assim não houve 401 —
      // confirma ausência de withSession/requireAuth no caminho da rota.
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("corpo sem token → 400 com detalhe Zod (mesmo padrão dos outros controllers)", async () => {
      const res = await request(app)
        .post(`${BASE}/unsubscribe`)
        .send({})
        .expect(400);

      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
      });
      expect(res.body.details).toHaveProperty("token");
      expect(tokenMocks.verifyUnsubscribeToken).not.toHaveBeenCalled();
    });
  });
});
