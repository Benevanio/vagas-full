import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 300 }),
  };
});

const hookMock = vi.hoisted(() => ({
  useReportsKpis: vi.fn(),
}));

vi.mock("@/domains/new_dashboard/hooks/useReportsKpis", () => ({
  useReportsKpis: hookMock.useReportsKpis,
}));

import { ReportsSummary } from "@/domains/new_dashboard/components/reports/ReportsSummary";
import { ReportsTab } from "@/domains/new_dashboard/components/reports/ReportsTab";
import type { ReportsKpis } from "@/domains/new_dashboard/infrastructure/reportsApi";

const dataFixture: ReportsKpis = {
  range: { from: "2025-12-15", to: "2026-03-15" },
  weeklyApplications: [
    { week: "2026-W09", weekStart: "2026-02-23", count: 1 },
    { week: "2026-W10", weekStart: "2026-03-02", count: 4 },
  ],
  interviewRate: { value: 67, insufficientData: false },
  stageDurations: {
    savedToApplied: 2.5,
    appliedToInterviewing: 3,
    interviewingToOutcome: null,
  },
};

const emptyFixture: ReportsKpis = {
  range: { from: "2025-12-15", to: "2026-03-15" },
  weeklyApplications: [],
  interviewRate: { value: 0, insufficientData: true },
  stageDurations: {
    savedToApplied: null,
    appliedToInterviewing: null,
    interviewingToOutcome: null,
  },
};

function baseHookReturn(overrides: Partial<ReturnType<typeof hookMock.useReportsKpis>>) {
  return {
    data: null,
    isLoading: false,
    error: null,
    period: "90d",
    setPeriod: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

describe("ReportsSummary", () => {
  it("mostra total, taxa e a semana mais ativa (KPI-17)", () => {
    render(<ReportsSummary data={dataFixture} />);

    expect(screen.getByText("5")).toBeInTheDocument(); // 1 + 4
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2026-W10")).toBeInTheDocument(); // maior count
  });

  it("com série vazia, mostra '—' para a semana mais ativa (KPI-17)", () => {
    render(<ReportsSummary data={emptyFixture} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ReportsTab", () => {
  beforeEach(() => {
    hookMock.useReportsKpis.mockReset();
  });

  it("enquanto carrega, mostra o estado de loading (KPI-11)", () => {
    hookMock.useReportsKpis.mockReturnValue(baseHookReturn({ isLoading: true }));

    render(<ReportsTab />);

    expect(screen.getByText("Carregando relatórios...")).toBeInTheDocument();
  });

  it(
    "com dados, renderiza o sumário e os 3 gráficos (KPI-12)",
    () => {
      hookMock.useReportsKpis.mockReturnValue(
        baseHookReturn({ data: dataFixture }),
      );

      render(<ReportsTab />);

      expect(screen.getByText("Candidaturas por semana")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Taxa de entrevista" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Tempo médio por etapa")).toBeInTheDocument();
      // "67%" aparece no tile de sumário e no centro do donut.
      expect(screen.getAllByText("67%").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Vaga salva → Candidatura")).toBeInTheDocument();
    },
    // Renderiza 3 gráficos Recharts reais (SVG) de uma vez; sob cobertura
    // (v8) fica bem mais lento que o timeout padrão de 5s.
    15000,
  );

  it("com resposta vazia, mostra empty state em cada card (KPI-14)", () => {
    hookMock.useReportsKpis.mockReturnValue(
      baseHookReturn({ data: emptyFixture }),
    );

    render(<ReportsTab />);

    const emptyMessages = screen.getAllByText("Sem dados no período.");
    expect(emptyMessages.length).toBeGreaterThanOrEqual(2); // semanal + taxa
  });

  it("em erro, mostra a mensagem e o botão 'Tentar novamente' chama reload (KPI-15)", () => {
    const reload = vi.fn();
    hookMock.useReportsKpis.mockReturnValue(
      baseHookReturn({ error: "Não foi possível carregar.", reload }),
    );

    render(<ReportsTab />);

    expect(screen.getByText("Não foi possível carregar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("trocar o preset no seletor chama setPeriod (KPI-13)", () => {
    const setPeriod = vi.fn();
    hookMock.useReportsKpis.mockReturnValue(
      baseHookReturn({ data: dataFixture, setPeriod }),
    );

    render(<ReportsTab />);

    fireEvent.click(screen.getByRole("button", { name: "30 dias" }));
    expect(setPeriod).toHaveBeenCalledWith("30d");
  });
});
