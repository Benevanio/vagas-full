import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRepo = vi.hoisted(() => ({
  fetchUserActivity: vi.fn(),
}));

const mockComputeKpis = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/modules/reports/reports.kpis", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/modules/reports/reports.kpis")>();
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

describe("ReportsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeKpis.mockReturnValue(fixtureReport);
  });

  it("repassa o userId ao repositório (KPI-06)", async () => {
    const activity = { savedJobs: [], events: [] };
    mockRepo.fetchUserActivity.mockResolvedValue(activity);

    const service = new ReportsService(mockRepo as never);
    const range = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    };
    await service.getKpis("user-42", range);

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
    const range = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    };
    await service.getKpis("user-42", range);

    expect(mockComputeKpis).toHaveBeenCalledWith({
      savedJobs: savedJobsFixture,
      events: eventsFixture,
      from: range.from,
      to: range.to,
    });
  });

  it("devolve exatamente o KpiReport produzido pelo core", async () => {
    mockRepo.fetchUserActivity.mockResolvedValue({ savedJobs: [], events: [] });

    const service = new ReportsService(mockRepo as never);
    const result = await service.getKpis("user-42", {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    });

    expect(result).toBe(fixtureReport);
  });
});
