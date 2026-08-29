import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheSearchKeywords: vi.fn(),
  cacheSearchJobIds: vi.fn(),
  cacheAbsoluteSMembers: vi.fn(),
  cacheGetJobsByIds: vi.fn(),
  getCache: vi.fn(),
  cachePing: vi.fn(),
  poolQuery: vi.fn(),
  publish: vi.fn(),
  logWarn: vi.fn(),
  parsePagination: vi.fn(),
  paginate: vi.fn(),
  dbOrderBy: vi.fn(),
  dbWhere: vi.fn(),
  dbInsert: vi.fn(),
  dbInsertValues: vi.fn(),
  dbInsertConflict: vi.fn(),
  getUserById: vi.fn(),
  createHighMatchIfMissing: vi.fn(),
  jobSearchesInc: vi.fn(),
}));

vi.mock("../../src/lib/cache.js", () => ({
  cacheSearchKeywords: mocks.cacheSearchKeywords,
  cacheSearchJobIds: mocks.cacheSearchJobIds,
  cacheAbsoluteSMembers: mocks.cacheAbsoluteSMembers,
  cacheGetJobsByIds: mocks.cacheGetJobsByIds,
  getCache: mocks.getCache,
  cachePing: mocks.cachePing,
}));

vi.mock("../../src/lib/kwsync.js", () => ({
  publish: mocks.publish,
}));

vi.mock("../../src/lib/pagination.js", () => ({
  parsePagination: mocks.parsePagination,
  paginate: mocks.paginate,
}));

vi.mock("../../src/db/client.js", () => ({
  pool: { query: mocks.poolQuery },
  db: {
    select: () => ({
      from: () => ({
        where: mocks.dbWhere,
      }),
    }),
    insert: mocks.dbInsert,
  },
}));

vi.mock("../../src/db/schema.js", () => ({
  keywords: {
    userId: "userId",
    keyword: "keyword",
    source: "source",
    createdAt: "createdAt",
  },
}));

vi.mock("../../src/logger.js", () => ({
  logWarn: mocks.logWarn,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/metrics/metrics.js", () => ({
  register: { contentType: "text/plain", metrics: vi.fn().mockResolvedValue("") },
  httpRequestDuration: { startTimer: vi.fn(() => vi.fn()) },
  httpRequestsTotal: { inc: vi.fn() },
  jobSearchesTotal: { inc: mocks.jobSearchesInc },
}));

vi.mock("../../src/routes/auth.routes.js", async () => {
  const { Router } = await import("express");
  return { authRoutes: Router() };
});

vi.mock("../../src/routes/savedJobs.routes.js", async () => {
  const { Router } = await import("express");
  return { savedJobsRoutes: Router() };
});

vi.mock("../../src/routes/users.routes.js", async () => {
  const { Router } = await import("express");
  return { userRoutes: Router() };
});

vi.mock("../../src/modules/users/users.service.js", () => ({
  UsersService: class {
    getUserById = mocks.getUserById;
  },
}));

vi.mock("../../src/modules/notifications/notifications.service.js", () => ({
  NotificationsService: class {
    createHighMatchIfMissing = mocks.createHighMatchIfMissing;
  },
}));

vi.mock("../../src/middleware/withSession.js", () => ({
  withSession: (req: any, _res: any, next: any) => {
    req.session = { userId: "test-user-id" };
    next();
  },
}));

import { createJobsApiApp } from "../../src/app.js";

const DEFAULT_PAGINATION = { page: 1, limit: 100 };
const DEFAULT_PAGINATED = (ids: string[]) => ({
  data: ids,
  pagination: {
    total: ids.length,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
});

describe("jobsApiApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KWSYNC_ENABLED = "false";

    mocks.parsePagination.mockReturnValue(DEFAULT_PAGINATION);
    mocks.paginate.mockImplementation((ids: string[]) =>
      DEFAULT_PAGINATED(ids),
    );
    mocks.cacheSearchKeywords.mockResolvedValue(["id-1", "id-2"]);
    mocks.cacheSearchJobIds.mockResolvedValue([]);
    mocks.cacheAbsoluteSMembers.mockResolvedValue(["id-1", "id-2"]);
    mocks.cacheGetJobsByIds.mockResolvedValue([
      { id: "id-1", title: "Dev Java", company: "ACME" },
      { id: "id-2", title: "Dev Node", company: "Globo" },
    ]);
    mocks.dbOrderBy.mockResolvedValue([
      { keyword: "Java", source: "user" },
      { keyword: "Node.js", source: "user" },
    ]);
    mocks.dbWhere.mockReturnValue({ orderBy: mocks.dbOrderBy });
    mocks.dbInsertConflict.mockResolvedValue(undefined);
    mocks.dbInsertValues.mockReturnValue({
      onConflictDoNothing: mocks.dbInsertConflict,
    });
    mocks.dbInsert.mockReturnValue({ values: mocks.dbInsertValues });
    mocks.getUserById.mockResolvedValue(null);
    mocks.createHighMatchIfMissing.mockResolvedValue(undefined);
    mocks.getCache.mockResolvedValue({ lPush: vi.fn() });
    mocks.cachePing.mockResolvedValue("PONG");
    mocks.poolQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    mocks.publish.mockResolvedValue(undefined);
  });

  // ── health ────────────────────────────────────────────────────────────

  it("GET /health retorna ok", async () => {
    const app = createJobsApiApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /ready confirma banco e Valkey disponíveis", async () => {
    const app = createJobsApiApp();
    const res = await request(app).get("/ready").expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mocks.poolQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mocks.cachePing).toHaveBeenCalledOnce();
  });

  it("GET /ready retorna indisponível quando uma dependência falha", async () => {
    mocks.cachePing.mockRejectedValueOnce(new Error("Valkey indisponível"));
    const app = createJobsApiApp();
    const res = await request(app).get("/ready").expect(503);

    expect(res.body).toEqual({ ok: false });
  });

  it("GET /ready retorna indisponível quando uma dependência fica pendurada", async () => {
    mocks.poolQuery.mockImplementationOnce(() => new Promise(() => {}));
    const app = createJobsApiApp();
    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false });
  }, 4_000);

  // ── CORS ──────────────────────────────────────────────────────────────

  it("permite CORS para origem autorizada", async () => {
    const app = createJobsApiApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173")
      .expect(200);

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("bloqueia origens não autorizadas", async () => {
    const app = createJobsApiApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://malicioso.example")
      .expect(403);

    expect(res.body).toEqual({
      code: "FORBIDDEN",
      message: "Origem não permitida.",
    });
  });

  it("bloqueia previews do Vercel fora da allowlist explícita", async () => {
    const app = createJobsApiApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://painel-vagas-preview.vercel.app")
      .expect(403);

    expect(res.body.message).toBe("Origem não permitida.");
  });

  it("usa origens do CORS_ALLOWED_ORIGINS quando definido", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://meuapp.com";
    const app = createJobsApiApp();

    const allowed = await request(app)
      .get("/health")
      .set("Origin", "https://meuapp.com")
      .expect(200);

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://meuapp.com",
    );

    const blocked = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173")
      .expect(403);

    expect(blocked.body).toEqual({
      code: "FORBIDDEN",
      message: "Origem não permitida.",
    });
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  // ── security headers ──────────────────────────────────────────────────

  it("adiciona headers de segurança", async () => {
    const app = createJobsApiApp();
    const res = await request(app).get("/health").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  // ── jobs/search ───────────────────────────────────────────────────────

  it("GET /jobs/search com keywords filtra via cacheSearchKeywords", async () => {
    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "React,Node.js" })
      .expect(200);

    expect(mocks.cacheSearchKeywords).toHaveBeenCalledWith([
      "React",
      "Node.js",
    ]);
    expect(mocks.cacheAbsoluteSMembers).not.toHaveBeenCalled();
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.source).toContain("valkey_filtered_by_keywords");
  });

  it("GET /jobs/search sem keywords usa índice global", async () => {
    const app = createJobsApiApp();
    const res = await request(app).get("/jobs/search").expect(200);

    expect(mocks.cacheAbsoluteSMembers).toHaveBeenCalledWith(
      "scraper:jobs:index",
    );
    expect(mocks.cacheSearchKeywords).not.toHaveBeenCalled();
    expect(res.body.source).toBe("valkey_global_index");
  });

  it("GET /jobs/search aplica filtros de level, location e type", async () => {
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-1",
        title: "Desenvolvedor Node.js Júnior",
        company: "ACME",
        location: "Brasil - Remoto",
      },
      {
        id: "id-2",
        title: "Desenvolvedor Node.js Sênior",
        company: "Globo",
        location: "Estados Unidos - Remoto",
      },
      {
        id: "id-3",
        title: "Desenvolvedor Node.js Pleno",
        company: "Globex",
        location: "Brasil - Hybrid Remote",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({
        keywords: "Node.js",
        level: "Júnior",
        location: "Brasil",
        type: "Remoto",
      })
      .expect(200);

    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-1" })]);
    expect(res.body.total).toBe(1);
  });

  it("GET /jobs/search usa índices estruturados quando há filtros", async () => {
    mocks.cacheSearchJobIds.mockResolvedValue(["id-structured"]);
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-structured",
        title: "Dev React Júnior",
        company: "ACME",
        location: "Brasil - Remoto",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({
        keywords: "React",
        level: "Júnior",
        location: "Brasil",
        type: "Remoto",
      })
      .expect(200);

    expect(mocks.cacheSearchJobIds).toHaveBeenCalledWith({
      keywords: ["React"],
      family: [],
      technology: [],
      seniority: "",
      level: "Júnior",
      location: "Brasil",
      continent: "",
      country: "",
      state: "",
      city: "",
      type: ["Remoto"],
      model: ["Remoto"],
      contract: "",
    });
    expect(mocks.jobSearchesInc).toHaveBeenCalledWith({ has_keywords: "true" });
    expect(mocks.cacheSearchKeywords).not.toHaveBeenCalled();
    expect(mocks.cacheGetJobsByIds).toHaveBeenCalledWith(["id-structured"]);
    expect(res.body.jobs).toEqual([
      expect.objectContaining({ id: "id-structured" }),
    ]);
    expect(res.body.source).toContain("structured_indexes");
    expect(res.body.source).toContain("verified");
  });

  it("GET /jobs/search valida resultados dos índices estruturados antes de responder", async () => {
    mocks.cacheSearchJobIds.mockResolvedValue([
      "id-good",
      "id-pleno",
      "id-presencial",
      "id-us",
    ]);
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-good",
        title: "Dev React Júnior",
        company: "ACME",
        location: "Brasil - Remoto",
      },
      {
        id: "id-pleno",
        title: "Remote Frontend Software Engineer",
        company: "Globex",
        location: "Brasil - Remoto",
      },
      {
        id: "id-presencial",
        title: "Web Application Full Stack Developer",
        company: "Carrier",
        location: "Brasil",
      },
      {
        id: "id-us",
        title: "Dev React Júnior",
        company: "Affirm",
        location: "Miami, Flórida, Estados Unidos, Brasil",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({
        level: "Júnior",
        location: "Brasil",
        type: "Remoto",
      })
      .expect(200);

    expect(mocks.cacheGetJobsByIds).toHaveBeenCalledWith([
      "id-good",
      "id-pleno",
      "id-presencial",
      "id-us",
    ]);
    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-good" })]);
    expect(res.body.total).toBe(1);
    expect(res.body.source).toBe("valkey_global_index:structured_indexes:verified");
  });

  it("GET /jobs/search filtra vagas de estágio e trainee", async () => {
    mocks.cacheSearchJobIds.mockResolvedValue(["id-intern", "id-junior"]);
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-intern",
        title: "Software Engineering Intern",
        company: "ACME",
        location: "Brasil - Remoto",
      },
      {
        id: "id-junior",
        title: "Junior Frontend Developer",
        company: "Globex",
        location: "Brasil - Remoto",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({
        level: "Estágio/Trainee",
        location: "Brasil",
        type: "Remoto",
      })
      .expect(200);

    expect(mocks.cacheSearchJobIds).toHaveBeenCalledWith(
      expect.objectContaining({ level: "Estágio/Trainee" }),
    );
    expect(res.body.jobs).toEqual([
      expect.objectContaining({ id: "id-intern" }),
    ]);
    expect(res.body.total).toBe(1);
  });

  it("GET /jobs/search diferencia modelo híbrido de remoto", async () => {
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-1",
        title: "Desenvolvedor Node.js",
        company: "ACME",
        location: "Brasil - Remote",
      },
      {
        id: "id-2",
        title: "Desenvolvedor Node.js",
        company: "Globex",
        location: "Brasil - Hybrid Remote",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "Node.js", type: "Híbrido" })
      .expect(200);

    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-2" })]);
    expect(res.body.total).toBe(1);
  });

  it("GET /jobs/search calcula match por perfil e registra alto match", async () => {
    mocks.getUserById.mockResolvedValue({
      id: "test-user-id",
      technologies: ["React", "TypeScript"],
      technologyExperiencesEncrypted: null,
    });
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-match",
        title: "React TypeScript Developer",
        company: "ACME",
        location: "Brasil - Remote",
        url: "https://example.com/jobs/id-match",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "React" })
      .expect(200);

    expect(res.body.jobs).toEqual([
      expect.objectContaining({
        id: "id-match",
        matchScore: expect.any(Number),
        matchSource: "backend_profile",
        matchedTechnologies: ["React", "TypeScript"],
      }),
    ]);
    expect(res.body.jobs[0].matchScore).toBeGreaterThanOrEqual(85);
    expect(mocks.createHighMatchIfMissing).toHaveBeenCalledWith(
      "test-user-id",
      expect.objectContaining({
        id: "id-match",
        matchScore: expect.any(Number),
        matchSource: "backend_profile",
      }),
    );
  });

  it("GET /jobs/search ordena por match globalmente antes da paginação", async () => {
    mocks.parsePagination.mockReturnValue({ page: 1, limit: 2 });
    mocks.paginate.mockImplementationOnce((jobs: unknown[], params: any) => ({
      data: jobs.slice(0, params.limit),
      pagination: {
        total: jobs.length,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(jobs.length / params.limit),
        hasNext: true,
        hasPrev: false,
      },
    }));
    mocks.cacheAbsoluteSMembers.mockResolvedValue(["low", "high", "middle"]);
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "low",
        title: "Customer Success",
        company: "ACME",
        location: "Brasil",
      },
      {
        id: "high",
        title: "React TypeScript Node Developer",
        company: "Globex",
        location: "Brasil",
      },
      {
        id: "middle",
        title: "React Developer",
        company: "Initech",
        location: "Brasil",
      },
    ]);
    mocks.getUserById.mockResolvedValue({
      id: "test-user-id",
      technologies: ["React", "TypeScript", "Node"],
      technologyExperiencesEncrypted: null,
    });

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ matchSort: "desc", page: "1", limit: "2" })
      .expect(200);

    expect(mocks.cacheGetJobsByIds).toHaveBeenCalledWith([
      "low",
      "high",
      "middle",
    ]);
    expect(res.body.jobs.map((job: any) => job.id)).toEqual([
      "high",
      "middle",
    ]);
    expect(res.body.total).toBe(3);
    expect(res.body.source).toBe("valkey_global_index:match_sorted_desc");
  });

  it("GET /jobs/search retorna paginação correta", async () => {
    mocks.parsePagination.mockReturnValue({ page: 2, limit: 10 });
    mocks.paginate.mockReturnValue({
      data: ["id-1"],
      pagination: {
        total: 15,
        page: 2,
        limit: 10,
        totalPages: 2,
        hasNext: false,
        hasPrev: true,
      },
    });
    mocks.cacheGetJobsByIds.mockResolvedValue([
      { id: "id-1", title: "Dev", company: "ACME" },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ page: "2", limit: "10" })
      .expect(200);

    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(res.body.total).toBe(15);
    expect(res.body.hasPrev).toBe(true);
    expect(res.body.hasNext).toBe(false);
  });

  it("GET /jobs/search retorna 500 quando cacheSearchKeywords falha", async () => {
    mocks.cacheSearchKeywords.mockRejectedValueOnce(new Error("valkey down"));
    const app = createJobsApiApp();

    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "Java" })
      .expect(500);

    expect(res.body.message).toBe("Erro ao recuperar vagas em memória.");
    expect(res.body.error).toBe("valkey down");
    expect(mocks.logWarn).toHaveBeenCalled();
  });

  it("GET /jobs/search retorna 500 quando cacheAbsoluteSMembers falha", async () => {
    mocks.cacheAbsoluteSMembers.mockRejectedValueOnce(new Error("valkey down"));
    const app = createJobsApiApp();

    const res = await request(app).get("/jobs/search").expect(500);

    expect(res.body.message).toBe("Erro ao recuperar vagas em memória.");
  });

  it("GET /jobs/search trata filtros em array e aplica o primeiro valor", async () => {
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-array",
        title: "Desenvolvedor Node.js Júnior",
        company: "ACME",
        location: "Brasil - Remoto",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({
        keywords: "Node.js",
        level: ["Júnior", "Sênior"],
        location: ["Brasil", "Portugal"],
        type: ["Remoto", "Híbrido"],
      })
      .expect(200);

    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-array" })]);
    expect(res.body.total).toBe(1);
  });

  it("GET /jobs/search identifica vaga sênior presencial", async () => {
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-senior",
        title: "Tech Lead Sênior",
        company: "ACME",
        location: "São Paulo - Onsite",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "Tech Lead", type: "Presencial" })
      .expect(200);

    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-senior" })]);
    expect(res.body.total).toBe(1);
  });

  it("GET /jobs/search usa o fallback de tipo presencial quando não há pistas de remoto", async () => {
    mocks.cacheGetJobsByIds.mockResolvedValue([
      {
        id: "id-fallback",
        title: "Backend Developer",
        company: "ACME",
        location: "Brasil",
      },
    ]);

    const app = createJobsApiApp();
    const res = await request(app)
      .get("/jobs/search")
      .query({ keywords: "Backend", type: "Presencial" })
      .expect(200);

    expect(res.body.jobs).toEqual([expect.objectContaining({ id: "id-fallback" })]);
    expect(res.body.total).toBe(1);
  });

  // ── keywords ──────────────────────────────────────────────────────────

  it("GET /keywords retorna keywords do banco", async () => {
    const app = createJobsApiApp();
    const res = await request(app).get("/keywords").expect(200);

    expect(res.body).toEqual({
      ok: true,
      keywords: [
        { keyword: "Java", source: "user" },
        { keyword: "Node.js", source: "user" },
      ],
    });
  });

  it("GET /keywords retorna 500 quando db falha", async () => {
    // Sobrescreve o mock estático do db para rejeitar nessa chamada
    const { db } = await import("../../src/db/client.js");
    vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const app = createJobsApiApp();
    const res = await request(app).get("/keywords").expect(500);
    expect(res.body.message).toBe("Erro ao buscar keywords.");
  });

  it("POST /keywords enfileira keyword e retorna 202", async () => {
    process.env.KWSYNC_ENABLED = "true";

    const app = createJobsApiApp();
    const res = await request(app)
      .post("/keywords")
      .send({ keyword: "Rust" })
      .expect(202);

    expect(mocks.getCache).toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.anything(),
      "Rust",
      "user",
      "test-user-id",
    );
    expect(mocks.dbInsertValues).toHaveBeenCalledWith({
      keyword: "Rust",
      source: "user",
      userId: "test-user-id",
    });
    expect(res.body).toEqual({
      ok: true,
      message: "Keyword enfileirada para processamento.",
    });
  });

  it("POST /keywords retorna 403 quando kwsync está desabilitado", async () => {
    const app = createJobsApiApp();

    const res = await request(app)
      .post("/keywords")
      .send({ keyword: "Rust" })
      .expect(403);

    expect(res.body).toEqual({
      ok: false,
      message: "Submissão de keywords por usuário está desabilitada.",
    });
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.getCache).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("POST /keywords retorna 400 quando keyword está ausente", async () => {
    process.env.KWSYNC_ENABLED = "true";

    const app = createJobsApiApp();

    const res = await request(app).post("/keywords").send({}).expect(400);

    expect(res.body.message).toBe(
      "O campo 'keyword' deve ser uma string não vazia.",
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("POST /keywords retorna 400 quando keyword é string vazia", async () => {
    process.env.KWSYNC_ENABLED = "true";

    const app = createJobsApiApp();

    const res = await request(app)
      .post("/keywords")
      .send({ keyword: "   " })
      .expect(400);

    expect(res.body.message).toBe(
      "O campo 'keyword' deve ser uma string não vazia.",
    );
  });

  it("POST /keywords retorna 400 quando keyword não é string", async () => {
    process.env.KWSYNC_ENABLED = "true";

    // Arrays não são strings — a rota rejeita com 400 se keyword.trim() não existir
    // ou com 500 se explodir antes. Ajusta a expectativa ao comportamento real da rota:
    // req.body?.keyword?.trim() em um array retorna undefined → cai no if → 400
    // Para garantir 400, envie um tipo que passe pelo optional chaining mas falhe no trim:
    const app = createJobsApiApp();

    const res = await request(app)
      .post("/keywords")
      .send({ keyword: 123 }) // número: typeof !== "string" → falha na guard
      .expect(400);

    expect(res.body.message).toBe(
      "O campo 'keyword' deve ser uma string não vazia.",
    );
  });
});
