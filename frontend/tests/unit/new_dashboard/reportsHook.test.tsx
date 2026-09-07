import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportsApiMock = vi.hoisted(() => ({
  getReportsKpis: vi.fn(),
  periodToRange: vi.fn(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/reportsApi", () => ({
  getReportsKpis: reportsApiMock.getReportsKpis,
  periodToRange: reportsApiMock.periodToRange,
}));

import { useReportsKpis } from "@/domains/new_dashboard/hooks/useReportsKpis";

const fixtureReport = {
  range: { from: "2025-12-15", to: "2026-03-15" },
  weeklyApplications: [{ week: "2026-W10", weekStart: "2026-03-02", count: 1 }],
  interviewRate: { value: 100, insufficientData: false },
  stageDurations: {
    savedToApplied: 2,
    appliedToInterviewing: null,
    interviewingToOutcome: null,
  },
};

describe("useReportsKpis", () => {
  beforeEach(() => {
    reportsApiMock.getReportsKpis.mockReset();
    reportsApiMock.periodToRange.mockReset();
    reportsApiMock.periodToRange.mockImplementation((preset: string) => ({
      preset,
    }));
  });

  it("busca com o período default (90d) no mount e reflete o loading (KPI-11)", async () => {
    reportsApiMock.getReportsKpis.mockResolvedValue(fixtureReport);

    const { result } = renderHook(() => useReportsKpis());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.period).toBe("90d");

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(fixtureReport);
    expect(reportsApiMock.periodToRange).toHaveBeenCalledWith("90d");
    expect(reportsApiMock.getReportsKpis).toHaveBeenCalledWith(
      { preset: "90d" },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("trocar o período refaz a chamada com os novos parâmetros (KPI-13)", async () => {
    reportsApiMock.getReportsKpis.mockResolvedValue(fixtureReport);

    const { result } = renderHook(() => useReportsKpis());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    reportsApiMock.getReportsKpis.mockClear();
    reportsApiMock.periodToRange.mockClear();

    act(() => {
      result.current.setPeriod("30d");
    });

    expect(result.current.period).toBe("30d");
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(reportsApiMock.periodToRange).toHaveBeenCalledWith("30d");
    expect(reportsApiMock.getReportsKpis).toHaveBeenCalledWith(
      { preset: "30d" },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("em caso de falha, preenche error e não lança (KPI-15)", async () => {
    reportsApiMock.getReportsKpis.mockRejectedValue(new Error("falha de rede"));

    const { result } = renderHook(() => useReportsKpis());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("falha de rede");
    expect(result.current.data).toBeNull();
  });

  it("troca de período cancela a requisição anterior (evita sobrescrever com resposta atrasada)", async () => {
    const staleReport = { ...fixtureReport, range: { from: "stale", to: "stale" } };
    const freshReport = { ...fixtureReport, range: { from: "fresh", to: "fresh" } };

    let resolveStale!: (value: typeof staleReport) => void;
    const stalePromise = new Promise<typeof staleReport>((resolve) => {
      resolveStale = resolve;
    });

    let capturedStaleSignal: AbortSignal | undefined;
    reportsApiMock.getReportsKpis.mockImplementationOnce(
      (_params: unknown, options: { signal?: AbortSignal }) => {
        capturedStaleSignal = options.signal;
        return stalePromise;
      },
    );

    const { result } = renderHook(() => useReportsKpis());

    // Troca de período ANTES da primeira requisição (90d) resolver.
    reportsApiMock.getReportsKpis.mockResolvedValueOnce(freshReport);
    act(() => {
      result.current.setPeriod("30d");
    });

    // A requisição antiga precisa ter sido cancelada de verdade.
    expect(capturedStaleSignal?.aborted).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(freshReport);

    // A resposta atrasada da requisição antiga chega DEPOIS — não pode
    // sobrescrever o dado do período atual.
    resolveStale(staleReport);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.data).toEqual(freshReport);
  });

  it("reload() refaz a chamada do período atual", async () => {
    reportsApiMock.getReportsKpis.mockResolvedValue(fixtureReport);

    const { result } = renderHook(() => useReportsKpis());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    reportsApiMock.getReportsKpis.mockClear();

    act(() => {
      result.current.reload();
    });

    await waitFor(() =>
      expect(reportsApiMock.getReportsKpis).toHaveBeenCalledTimes(1),
    );
  });
});
