import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── ReportsService mock ────────────────────────────────────────────────────

const mockReportsService = vi.hoisted(() => ({
  getKpis: vi.fn(),
}));

vi.mock("../../../src/modules/reports/reports.service", () => ({
  ReportsService: class {
    constructor() {
      return mockReportsService;
    }
  },
}));

// ── iron-session ────────────────────────────────────────────────────────────
// ReportsController chama getIronSession diretamente, além do withSession
// aplicado globalmente no app.ts.

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

import { getIronSession } from "iron-session";
import { createJobsApiApp } from "../../../src/app";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fixtureSession = {
  userId: "user_abc",
  save: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
};

const fixtureReport = {
  range: { from: "2025-12-16", to: "2026-03-15" },
  weeklyApplications: [{ week: "2026-W05", weekStart: "2026-01-26", count: 2 }],
  interviewRate: { value: 50, insufficientData: false },
  stageDurations: {
    savedToApplied: 2.5,
    appliedToInterviewing: null,
    interviewingToOutcome: null,
  },
};

const emptyReport = {
  range: { from: "2025-12-16", to: "2026-03-15" },
  weeklyApplications: [],
  interviewRate: { value: 0, insufficientData: true },
  stageDurations: {
    savedToApplied: null,
    appliedToInterviewing: null,
    interviewingToOutcome: null,
  },
};

const NOW = new Date("2026-03-15T12:00:00.000Z");

describe("Integration - Reports Routes", () => {
  let app: ReturnType<typeof createJobsApiApp>;
  const BASE = "/reports";

  beforeEach(() => {
    vi.clearAllMocks();
    // Só troca `Date` — deixar `setTimeout`/`setInterval` reais evita travar
    // o servidor HTTP que o supertest sobe por trás dos panos.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    vi.mocked(getIronSession).mockResolvedValue(fixtureSession as any);
    mockReportsService.getKpis.mockResolvedValue(fixtureReport);

    app = createJobsApiApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── GET /kpis ──────────────────────────────────────────────────────────────

  describe("GET /kpis", () => {
    it("sem query, retorna 200 com o KpiReport e janela dos últimos 90 dias (KPI-01)", async () => {
      const res = await request(app).get(`${BASE}/kpis`).expect(200);

      expect(res.body).toEqual(fixtureReport);
      expect(mockReportsService.getKpis).toHaveBeenCalledWith("user_abc", {
        all: false,
        from: new Date("2025-12-15T00:00:00.000Z"),
        to: new Date("2026-03-15T23:59:59.999Z"),
      });
    });

    it("repassa o userId da sessão ao service (KPI-06)", async () => {
      await request(app).get(`${BASE}/kpis`);

      expect(mockReportsService.getKpis).toHaveBeenCalledWith(
        "user_abc",
        expect.anything(),
      );
    });

    it("com resposta vazia do service, retorna 200 com estruturas zeradas (KPI-04)", async () => {
      mockReportsService.getKpis.mockResolvedValueOnce(emptyReport);

      const res = await request(app).get(`${BASE}/kpis`).expect(200);

      expect(res.body).toEqual(emptyReport);
    });

    it("com from/to válidos, ecoa a janela normalizada e repassa ao service (KPI-09)", async () => {
      await request(app)
        .get(`${BASE}/kpis`)
        .query({ from: "2026-01-01", to: "2026-01-31" })
        .expect(200);

      expect(mockReportsService.getKpis).toHaveBeenCalledWith("user_abc", {
        all: false,
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-01-31T23:59:59.999Z"),
      });
    });

    it("com all=true, repassa { all: true, to } ao service, sem janela de 90 dias", async () => {
      await request(app).get(`${BASE}/kpis`).query({ all: "true" }).expect(200);

      expect(mockReportsService.getKpis).toHaveBeenCalledWith("user_abc", {
        all: true,
        to: new Date("2026-03-15T23:59:59.999Z"),
      });
    });

    it("all=true ignora 'from' enviado junto (all tem prioridade)", async () => {
      await request(app)
        .get(`${BASE}/kpis`)
        .query({ all: "true", from: "2026-01-01" })
        .expect(200);

      expect(mockReportsService.getKpis).toHaveBeenCalledWith("user_abc", {
        all: true,
        to: new Date("2026-03-15T23:59:59.999Z"),
      });
    });

    it("retorna 401 quando não há sessão, e não chama o service (KPI-07)", async () => {
      vi.mocked(getIronSession).mockResolvedValueOnce({
        userId: undefined,
      } as any);

      const res = await request(app).get(`${BASE}/kpis`).expect(401);

      expect(res.body).toEqual({
        code: "UNAUTHORIZED",
        message: "Não autenticado.",
      });
      expect(mockReportsService.getKpis).not.toHaveBeenCalled();
    });

    it("retorna 400 quando 'from' tem formato inválido, e não chama o service (KPI-08)", async () => {
      await request(app)
        .get(`${BASE}/kpis`)
        .query({ from: "01/01/2026" })
        .expect(400);

      expect(mockReportsService.getKpis).not.toHaveBeenCalled();
    });

    it("retorna 400 quando from > to, e não chama o service (KPI-08)", async () => {
      const res = await request(app)
        .get(`${BASE}/kpis`)
        .query({ from: "2026-02-01", to: "2026-01-01" })
        .expect(400);

      expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mockReportsService.getKpis).not.toHaveBeenCalled();
    });

    it("retorna 500 quando o service lança erro", async () => {
      mockReportsService.getKpis.mockRejectedValueOnce(new Error("db error"));

      await request(app).get(`${BASE}/kpis`).expect(500);
    });
  });
});
