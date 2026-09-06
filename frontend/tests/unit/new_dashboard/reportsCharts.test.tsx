import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// ResponsiveContainer mede o container via ResizeObserver/getBoundingClientRect,
// que o jsdom não implementa — o mock abaixo injeta width/height fixos
// diretamente no gráfico filho para que o SVG seja renderizado de verdade.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 300 }),
  };
});

import { PeriodSelector } from "@/domains/new_dashboard/components/reports/PeriodSelector";
import { WeeklyApplicationsChart } from "@/domains/new_dashboard/components/reports/WeeklyApplicationsChart";

describe("PeriodSelector", () => {
  it("renderiza os 4 presets e marca o ativo", () => {
    render(<PeriodSelector value="90d" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "30 dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 dias" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "12 meses" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Tudo" })).toBeInTheDocument();
  });

  it("clicar num preset chama onChange com o valor certo", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="90d" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tudo" }));

    expect(onChange).toHaveBeenCalledWith("tudo");
  });
});

describe("WeeklyApplicationsChart", () => {
  it("com dados, renderiza o gráfico com uma barra por semana (KPI-12)", () => {
    const { container } = render(
      <WeeklyApplicationsChart
        data={[
          { week: "2026-W01", weekStart: "2025-12-29", count: 2 },
          { week: "2026-W02", weekStart: "2026-01-05", count: 3 },
        ]}
      />,
    );

    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
    expect(screen.getByText("2026-W01")).toBeInTheDocument();
    expect(screen.getByText("2026-W02")).toBeInTheDocument();
  });

  it("sem dados, mostra empty state em vez do gráfico, não um gráfico vazio (KPI-14)", () => {
    const { container } = render(<WeeklyApplicationsChart data={[]} />);

    expect(screen.getByText("Sem dados no período.")).toBeInTheDocument();
    expect(container.querySelector("svg.recharts-surface")).toBeNull();
  });
});
