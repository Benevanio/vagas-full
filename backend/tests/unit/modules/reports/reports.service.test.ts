import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRepo = vi.hoisted(() => ({
  fetchUserActivity: vi.fn(),
}));

const mockComputeKpis = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/modules/reports/reports.kpis", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/modules/reports/reports.kpis")>();
  // `earliestActivityDate` fica com a implementação real — é lógica simples
  // e testá-la de verdade aqui prova a integração service+core do modo "Tudo".
  return { ...actual, computeKpis: mockComputeKpis };
});

import type { KpiReport } from "../../../../src/modules/reports/reports.kpis";
import { ReportsService } from "../../../../src/modules/reports/reports.service";

const fixtureReport: KpiReport = {
  range: { from: "2026-01-01", to: "2026-03-31" },
  weeklyApplications: [],
  interviewRate: { value: 0, insufficientData: true },
  stageDurations: {
    savedToApplied: null,
    appliedToInterviewing: null,
    interviewingToOutcome: null,
  },
};

describe("ReportsService — janela por data (all: false)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeKpis.mockReturnValue(fixtureReport);
  });

  it("repassa o userId ao repositório (KPI-06)", async () => {
    const activity = { savedJobs: [], events: [] };
    mockRepo.fetchUserActivity.mockResolvedValue(activity);

    const service = new ReportsService(mockRepo as never);
    const query = {
      all: false as const,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    };
    await service.getKpis("user-42", query);

    expect(mockRepo.fetchUserActivity).toHaveBeenCalledWith("user-42");
  });

  it("repassa a janela recebida e a atividade buscada ao core (KPI-01, KPI-09)", async () => {
    const savedJobsFixture = [{ id: "j1" }];
    const eventsFixture = [{ id: "e1" }];
    mockRepo.fetchUserActivity.mockResolvedValue({
      savedJobs: savedJobsFixture,
      events: eventsFixture,
    });

    const service = new ReportsService(mockRepo as never);
    const query = {
      all: false as const,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    };
    await service.getKpis("user-42", query);

    expect(mockComputeKpis).toHaveBeenCalledWith({
      savedJobs: savedJobsFixture,
      events: eventsFixture,
      from: query.from,
      to: query.to,
    });
  });

  it("devolve exatamente o KpiReport produzido pelo core", async () => {
    mockRepo.fetchUserActivity.mockResolvedValue({ savedJobs: [], events: [] });

    const service = new ReportsService(mockRepo as never);
    const result = await service.getKpis("user-42", {
      all: false,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    });

    expect(result).toBe(fixtureReport);
  });
});

describe("ReportsService — todo o histórico (all: true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeKpis.mockReturnValue(fixtureReport);
  });

  const to = new Date("2026-03-31T23:59:59.999Z");

  it("usa a data da atividade mais antiga do usuário como 'from', não os 90 dias default", async () => {
    mockRepo.fetchUserActivity.mockResolvedValue({
      savedJobs: [
        { id: "j1", createdAt: new Date("2024-05-10T08:00:00.000Z") },
        { id: "j2", createdAt: new Date("2025-01-01T00:00:00.000Z") },
      ],
      events: [{ id: "e1", createdAt: new Date("2024-06-01T00:00:00.000Z") }],
    });

    const service = new ReportsService(mockRepo as never);
    await service.getKpis("user-42", { all: true, to });

    expect(mockComputeKpis).toHaveBeenCalledWith(
      expect.objectContaining({ from: new Date("2024-05-10T00:00:00.000Z"), to }),
    );
  });

  it("sem nenhuma atividade, usa 'to' como 'from' (janela vazia, sem quebrar)", async () => {
    mockRepo.fetchUserActivity.mockResolvedValue({ savedJobs: [], events: [] });

    const service = new ReportsService(mockRepo as never);
    await service.getKpis("user-42", { all: true, to });

    expect(mockComputeKpis).toHaveBeenCalledWith(
      expect.objectContaining({ from: to, to }),
    );
  });

  it("considera appliedAt retroativo ao calcular o início do histórico", async () => {
    mockRepo.fetchUserActivity.mockResolvedValue({
      savedJobs: [
        {
          id: "j1",
          status: "applied",
          appliedAt: new Date("2024-02-20T10:00:00.000Z"),
          createdAt: new Date("2026-01-05T00:00:00.000Z"),
        },
      ],
      events: [],
    });

    const service = new ReportsService(mockRepo as never);
    await service.getKpis("user-42", { all: true, to });

    expect(mockComputeKpis).toHaveBeenCalledWith(
      expect.objectContaining({ from: new Date("2024-02-20T00:00:00.000Z"), to }),
    );
  });

  it("com 'to' anterior à atividade mais antiga, não inverte a janela (from = to)", async () => {
    const pastTo = new Date("2020-01-01T23:59:59.999Z");
    mockRepo.fetchUserActivity.mockResolvedValue({
      savedJobs: [
        {
          id: "j1",
          status: "saved",
          appliedAt: null,
          createdAt: new Date("2024-05-10T08:00:00.000Z"),
        },
      ],
      events: [],
    });

    const service = new ReportsService(mockRepo as never);
    await service.getKpis("user-42", { all: true, to: pastTo });

    expect(mockComputeKpis).toHaveBeenCalledWith(
      expect.objectContaining({ from: pastTo, to: pastTo }),
    );
  });
});
