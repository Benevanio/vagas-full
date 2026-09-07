import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/lib/errors";

// ── SavedJobsService mock ─────────────────────────────────────────────────────

const mockSavedJobsService = vi.hoisted(() => ({
  getAll: vi.fn(),
  getById: vi.fn(),
  getEvents: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../../src/modules/savedJobs/savedJobs.service", () => ({
  SavedJobsService: class {
    constructor() {
      return mockSavedJobsService;
    }
  },
}));

// ── iron-session ──────────────────────────────────────────────────────────────
// SavedJobsController chama getIronSession diretamente em cada action,
// além do withSession aplicado globalmente no app.ts.

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

const fixtureJobId = "e4b095ff-6439-4112-b837-024a50f838b0";

const fixtureJob = {
  id: fixtureJobId,
  userId: "user_abc",
  jobLink: "https://example.com/job/1",
  jobTitle: "Engenheiro de Software",
  company: "Empresa X",
  location: "São Paulo",
  source: "linkedin",
  keyword: "typescript",
  status: "saved",
  appliedAt: null,
  notes: null,
  createdAt: new Date("2024-01-01").toISOString(),
  updatedAt: new Date("2024-01-01").toISOString(),
};

// Payload válido para POST (campos do createJobSchema)
const createPayload = {
  jobLink: "https://example.com/job/1",
  jobTitle: "Engenheiro de Software",
  company: "Empresa X",
  location: "São Paulo",
  source: "linkedin",
  keyword: "typescript",
  status: "saved",
};

const fixtureEvents = [
  {
    id: "event-1",
    userId: "user_abc",
    savedJobId: "job-1",
    type: "status_changed",
    fromStatus: "saved",
    toStatus: "applied",
    metadata: null,
    createdAt: new Date("2024-01-02").toISOString(),
  },
  {
    id: "event-2",
    userId: "user_abc",
    savedJobId: "job-1",
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "interviewing",
    metadata: null,
    createdAt: new Date("2024-01-03").toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("Integration - SavedJobs Routes", () => {
  let app: ReturnType<typeof createJobsApiApp>;
  const BASE = "/saved-jobs";

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getIronSession).mockResolvedValue(fixtureSession as any);

    mockSavedJobsService.getAll.mockResolvedValue([fixtureJob]);
    mockSavedJobsService.getById.mockResolvedValue(fixtureJob);
    mockSavedJobsService.getEvents.mockResolvedValue(fixtureEvents);
    mockSavedJobsService.create.mockResolvedValue(fixtureJob);
    mockSavedJobsService.update.mockResolvedValue({
      ...fixtureJob,
      status: "applied",
    });
    mockSavedJobsService.delete.mockResolvedValue(undefined);

    app = createJobsApiApp();
  });

  // ── GET / ─────────────────────────────────────────────────────────────────

  describe("GET /", () => {
    it("retorna 200 e lista de vagas", async () => {
      const res = await request(app).get(BASE).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty("jobLink", fixtureJob.jobLink);
    });

    it("chama getAll com o userId da sessão", async () => {
      await request(app).get(BASE);

      expect(mockSavedJobsService.getAll).toHaveBeenCalledWith("user_abc");
    });

    it("retorna lista vazia quando usuário não tem vagas", async () => {
      mockSavedJobsService.getAll.mockResolvedValueOnce([]);

      const res = await request(app).get(BASE).expect(200);

      expect(res.body).toEqual([]);
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app).get(BASE).expect(401);
    });

    it("retorna 500 quando getAll lança erro", async () => {
      mockSavedJobsService.getAll.mockRejectedValueOnce(new Error("db error"));

      await request(app).get(BASE).expect(500);
    });
  });

  // ── GET /:id ──────────────────────────────────────────────────────────────

  describe("GET /:id", () => {
    it("retorna 200 e a vaga encontrada", async () => {
      const res = await request(app).get(`${BASE}/${fixtureJobId}`).expect(200);

      expect(res.body).toHaveProperty("id", fixtureJobId);
    });

    it("chama getById com userId e jobId corretos", async () => {
      await request(app).get(`${BASE}/${fixtureJobId}`);

      expect(mockSavedJobsService.getById).toHaveBeenCalledWith(
        "user_abc",
        fixtureJobId,
      );
    });

    it("retorna 404 quando vaga não existe", async () => {
      mockSavedJobsService.getById.mockResolvedValueOnce(undefined);

      await request(app)
        .get(`${BASE}/11111111-1111-4111-8111-111111111111`)
        .expect(404);
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app).get(`${BASE}/${fixtureJobId}`).expect(401);
    });
  });

  // ── GET /:id/events ───────────────────────────────────────────────────────

  describe("GET /:id/events", () => {
    it("retorna os eventos em ordem cronológica", async () => {
      const res = await request(app)
        .get(`${BASE}/job-1/events`)
        .expect(200);

      expect(res.body).toEqual(fixtureEvents);
      expect(res.body.map((event: { id: string }) => event.id)).toEqual([
        "event-1",
        "event-2",
      ]);
    });

    it("usa o usuário autenticado para isolar a listagem", async () => {
      await request(app).get(`${BASE}/job-1/events`).expect(200);

      expect(mockSavedJobsService.getEvents).toHaveBeenCalledWith(
        "user_abc",
        "job-1",
      );
    });

    it("retorna 401 quando não há usuário autenticado", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app).get(`${BASE}/job-1/events`).expect(401);

      expect(mockSavedJobsService.getEvents).not.toHaveBeenCalled();
    });

    it("retorna 404 quando a vaga não pertence ao usuário", async () => {
      mockSavedJobsService.getEvents.mockRejectedValueOnce(
        AppError.notFound("Vaga não encontrada"),
      );

      const res = await request(app)
        .get(`${BASE}/job-2/events`)
        .expect(404);

      expect(res.body).toEqual({
        code: "NOT_FOUND",
        message: "Vaga não encontrada",
      });
    });
  });

  // ── POST / ────────────────────────────────────────────────────────────────

  describe("POST /", () => {
    it("cria vaga e retorna 201", async () => {
      const res = await request(app).post(BASE).send(createPayload).expect(201);

      expect(res.body).toHaveProperty("id", fixtureJobId);
    });

    it("chama create com userId e body parseado pelo Zod", async () => {
      await request(app).post(BASE).send(createPayload);

      expect(mockSavedJobsService.create).toHaveBeenCalledWith(
        "user_abc",
        expect.objectContaining({
          jobLink: createPayload.jobLink,
          company: createPayload.company,
          status: "saved",
        }),
      );
    });

    it("retorna 400 quando jobLink é inválido (Zod)", async () => {
      const res = await request(app)
        .post(BASE)
        .send({ ...createPayload, jobLink: "nao-e-url" })
        .expect(400);

      expect(res.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
      });
      expect(res.body.details).toHaveProperty("jobLink");
    });

    it("retorna 400 quando status é valor fora do enum", async () => {
      await request(app)
        .post(BASE)
        .send({ ...createPayload, status: "invalido" })
        .expect(400);
    });

    it("aceita candidatura manual sem jobLink", async () => {
      const { jobLink: _, ...withoutLink } = createPayload;

      await request(app).post(BASE).send(withoutLink).expect(201);
    });

    it("descarta campos desconhecidos (Zod strip)", async () => {
      await request(app)
        .post(BASE)
        .send({ ...createPayload, campoInexistente: "foo" });

      const calledBody = mockSavedJobsService.create.mock.calls[0][1];
      expect(calledBody).not.toHaveProperty("campoInexistente");
    });

    it("retorna 409 quando vaga já foi salva", async () => {
      mockSavedJobsService.create.mockRejectedValueOnce(
        AppError.conflict("Vaga já salva."),
      );

      const res = await request(app)
        .post(BASE)
        .send(createPayload)
        .expect(409);

      expect(res.body).toEqual({
        code: "CONFLICT",
        message: "Vaga já salva.",
      });
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      const res = await request(app)
        .post(BASE)
        .send(createPayload)
        .expect(401);

      expect(res.body).toEqual({
        code: "UNAUTHORIZED",
        message: "Não autenticado.",
      });
    });
  });

  // ── PATCH /:id ────────────────────────────────────────────────────────────

  describe("PATCH /:id", () => {
    const updatePayload = { status: "applied" };

    it("retorna 200 e a vaga com status atualizado", async () => {
      const res = await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send(updatePayload)
        .expect(200);

      expect(res.body).toHaveProperty("status", "applied");
    });

    it("chama update com userId, jobId e body corretos", async () => {
      await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send(updatePayload);

      expect(mockSavedJobsService.update).toHaveBeenCalledWith(
        "user_abc",
        fixtureJobId,
        expect.objectContaining({ status: "applied" }),
      );
    });

    it("retorna 400 para status fora do enum", async () => {
      await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send({ status: "nao-existe" })
        .expect(400);
    });

    it("retorna 400 para jobLink inválido no update", async () => {
      await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send({ jobLink: "nao-e-url" })
        .expect(400);
    });

    it("aceita body vazio (todos os campos são opcionais no updateJobSchema)", async () => {
      await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send({})
        .expect(200);

      expect(mockSavedJobsService.update).toHaveBeenCalledWith(
        "user_abc",
        fixtureJobId,
        {},
      );
    });

    it("retorna 404 quando update não encontra a vaga", async () => {
      mockSavedJobsService.update.mockRejectedValueOnce(
        AppError.notFound("Vaga não encontrada"),
      );

      const res = await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send(updatePayload)
        .expect(404);

      expect(res.body).toEqual({
        code: "NOT_FOUND",
        message: "Vaga não encontrada",
      });
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app)
        .patch(`${BASE}/${fixtureJobId}`)
        .send(updatePayload)
        .expect(401);
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  describe("DELETE /:id", () => {
    it("retorna 204 sem body", async () => {
      const res = await request(app)
        .delete(`${BASE}/${fixtureJobId}`)
        .expect(204);

      expect(res.text).toBe("");
    });

    it("chama delete com userId e jobId corretos", async () => {
      await request(app).delete(`${BASE}/${fixtureJobId}`);

      expect(mockSavedJobsService.delete).toHaveBeenCalledWith(
        "user_abc",
        fixtureJobId,
      );
    });

    it("retorna 401 quando sessão não tem userId", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      await request(app).delete(`${BASE}/${fixtureJobId}`).expect(401);
    });

    it("retorna 400 quando id não é um UUID válido", async () => {
      await request(app).delete(`${BASE}/${fixtureJobId}%22`).expect(400);

      expect(mockSavedJobsService.delete).not.toHaveBeenCalled();
    });

    it("retorna 500 quando delete lança erro", async () => {
      mockSavedJobsService.delete.mockRejectedValueOnce(new Error("db error"));

      await request(app).delete(`${BASE}/${fixtureJobId}`).expect(500);
    });
  });
});
