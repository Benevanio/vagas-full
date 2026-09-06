import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/shared/lib/apiClient", () => ({
  api: apiMock,
}));

import {
  getReportsKpis,
  periodToRange,
  toReportsKpis,
} from "@/domains/new_dashboard/infrastructure/reportsApi";

describe("reportsApi — toReportsKpis", () => {
  it("mapeia uma resposta completa da API", () => {
    const result = toReportsKpis({
      range: { from: "2026-01-01", to: "2026-03-31" },
      weeklyApplications: [
        { week: "2026-W02", weekStart: "2026-01-05", count: 3 },
      ],
      interviewRate: { value: 67, insufficientData: false },
      stageDurations: {
        savedToApplied: 2.5,
        appliedToInterviewing: null,
        interviewingToOutcome: 6,
      },
    });

    expect(result).toEqual({
      range: { from: "2026-01-01", to: "2026-03-31" },
      weeklyApplications: [
        { week: "2026-W02", weekStart: "2026-01-05", count: 3 },
      ],
      interviewRate: { value: 67, insufficientData: false },
      stageDurations: {
        savedToApplied: 2.5,
        appliedToInterviewing: null,
        interviewingToOutcome: 6,
      },
    });
  });

  it("tolera resposta parcial/ausente, normalizando para vazio/null", () => {
    const result = toReportsKpis({});

    expect(result).toEqual({
      range: { from: "", to: "" },
      weeklyApplications: [],
      interviewRate: { value: 0, insufficientData: true },
      stageDurations: {
        savedToApplied: null,
        appliedToInterviewing: null,
        interviewingToOutcome: null,
      },
    });
  });
});

describe("reportsApi — periodToRange", () => {
  const NOW = new Date("2026-03-15T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("30d → últimos 30 dias até hoje", () => {
    expect(periodToRange("30d")).toEqual({
      from: "2026-02-13",
      to: "2026-03-15",
    });
  });

  it("90d → últimos 90 dias até hoje", () => {
    expect(periodToRange("90d")).toEqual({
      from: "2025-12-15",
      to: "2026-03-15",
    });
  });

  it("12m → últimos 12 meses até hoje", () => {
    expect(periodToRange("12m")).toEqual({
      from: "2025-03-15",
      to: "2026-03-15",
    });
  });

  it("tudo → sem 'from'/'to'", () => {
    expect(periodToRange("tudo")).toEqual({});
  });
});

describe("reportsApi — getReportsKpis", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it("chama /reports/kpis com os params recebidos e mapeia a resposta", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        range: { from: "2026-01-01", to: "2026-01-31" },
        weeklyApplications: [],
        interviewRate: { value: 0, insufficientData: true },
        stageDurations: {
          savedToApplied: null,
          appliedToInterviewing: null,
          interviewingToOutcome: null,
        },
      },
    });

    const result = await getReportsKpis({ from: "2026-01-01", to: "2026-01-31" });

    expect(apiMock.get).toHaveBeenCalledWith("/reports/kpis", {
      params: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(result.range).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("sem params, chama /reports/kpis com params vazios", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        range: { from: "2025-12-15", to: "2026-03-15" },
        weeklyApplications: [],
        interviewRate: { value: 0, insufficientData: true },
        stageDurations: {
          savedToApplied: null,
          appliedToInterviewing: null,
          interviewingToOutcome: null,
        },
      },
    });

    await getReportsKpis();

    expect(apiMock.get).toHaveBeenCalledWith("/reports/kpis", { params: {} });
  });
});
