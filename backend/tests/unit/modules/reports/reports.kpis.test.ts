import { describe, expect, it } from "vitest";
import {
  computeKpis,
  isoWeekLabel,
  isoWeekStart,
  type KpiEvent,
  type KpiSavedJob,
} from "../../../../src/modules/reports/reports.kpis";

// ─── Helpers de fixtures ─────────────────────────────────────────────────────

function job(overrides: Partial<KpiSavedJob> & { id: string }): KpiSavedJob {
  return {
    status: "saved",
    appliedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function event(
  overrides: Partial<KpiEvent> & {
    id: string;
    savedJobId: string;
    fromStatus: KpiEvent["fromStatus"];
    toStatus: KpiEvent["toStatus"];
    createdAt: Date;
  },
): KpiEvent {
  return { ...overrides };
}

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-03-31T23:59:59.999Z");

// ─── computeKpis ─────────────────────────────────────────────────────────────

describe("computeKpis — weeklyApplications (KPI-02)", () => {
  it("soma dos count iguala o total de candidaturas submetidas no período", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a" }),
      job({ id: "b" }),
      job({ id: "c" }),
      job({ id: "d" }),
    ];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-05T10:00:00.000Z"), // 2026-W01
      }),
      event({
        id: "e2",
        savedJobId: "b",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-07T10:00:00.000Z"), // 2026-W02
      }),
      event({
        id: "e3",
        savedJobId: "c",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-08T10:00:00.000Z"), // 2026-W02
      }),
      // vaga "d" nunca saiu de saved → não é candidatura
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    const total = report.weeklyApplications.reduce((s, w) => s + w.count, 0);
    expect(total).toBe(3);
  });

  it("gera um item por semana ISO não-vazia, ordenado crescente por weekStart", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a" }),
      job({ id: "b" }),
      job({ id: "c" }),
    ];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-20T10:00:00.000Z"),
      }),
      event({
        id: "e2",
        savedJobId: "b",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-05T10:00:00.000Z"),
      }),
      event({
        id: "e3",
        savedJobId: "c",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-06T10:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    // b (2026-01-05) e c (2026-01-06) caem na mesma semana ISO (2026-W02);
    // a (2026-01-20) cai em 2026-W04. Nenhuma candidatura cai em 2026-W01.
    expect(report.weeklyApplications).toEqual([
      { week: "2026-W02", weekStart: "2026-01-05", count: 2 },
      { week: "2026-W04", weekStart: "2026-01-19", count: 1 },
    ]);
  });

  it("conta dado legado sem eventos pelo applied_at, com fallback para created_at", () => {
    const savedJobs: KpiSavedJob[] = [
      job({
        id: "legacy-applied-at",
        status: "applied",
        appliedAt: new Date("2026-01-06T12:00:00.000Z"),
        createdAt: new Date("2025-06-01T00:00:00.000Z"),
      }),
      job({
        id: "legacy-created-at",
        status: "rejected",
        appliedAt: null,
        createdAt: new Date("2026-01-07T09:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events: [], from: FROM, to: TO });

    expect(report.weeklyApplications).toEqual([
      { week: "2026-W02", weekStart: "2026-01-05", count: 2 },
    ]);
  });

  it("ignora candidaturas cujo momento de submissão cai fora da janela", () => {
    const savedJobs: KpiSavedJob[] = [job({ id: "a" }), job({ id: "b" })];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2025-12-31T10:00:00.000Z"), // antes de FROM
      }),
      event({
        id: "e2",
        savedJobId: "b",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-02-02T10:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    const total = report.weeklyApplications.reduce((s, w) => s + w.count, 0);
    expect(total).toBe(1);
  });
});

describe("computeKpis — interviewRate (KPI-03, KPI-04)", () => {
  it("value = round(Y / X * 100) e insufficientData = false", () => {
    // X = 3 submetidas, Y = 2 atingiram interviewing → round(66.66) = 67
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a" }),
      job({ id: "b" }),
      job({ id: "c" }),
    ];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-05T10:00:00.000Z"),
      }),
      event({
        id: "e2",
        savedJobId: "a",
        fromStatus: "applied",
        toStatus: "interviewing",
        createdAt: new Date("2026-01-10T10:00:00.000Z"),
      }),
      event({
        id: "e3",
        savedJobId: "b",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-06T10:00:00.000Z"),
      }),
      event({
        id: "e4",
        savedJobId: "b",
        fromStatus: "applied",
        toStatus: "interviewing",
        createdAt: new Date("2026-01-12T10:00:00.000Z"),
      }),
      event({
        id: "e5",
        savedJobId: "c",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-07T10:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    expect(report.interviewRate).toEqual({ value: 67, insufficientData: false });
  });

  it("conta vaga que pulou de saved direto para interviewing como candidatura e como atingiu interviewing", () => {
    const savedJobs: KpiSavedJob[] = [job({ id: "a", status: "interviewing" })];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "interviewing",
        createdAt: new Date("2026-01-05T10:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    expect(report.weeklyApplications.reduce((s, w) => s + w.count, 0)).toBe(1);
    expect(report.interviewRate).toEqual({ value: 100, insufficientData: false });
    // salto saved→interviewing não entra em nenhuma etapa de duração
    expect(report.stageDurations).toEqual({
      savedToApplied: null,
      appliedToInterviewing: null,
      interviewingToOutcome: null,
    });
  });

  it("denominador 0 → { value: 0, insufficientData: true } e weeklyApplications vazio", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a" }),
      job({ id: "b", status: "saved" }),
    ];

    const report = computeKpis({ savedJobs, events: [], from: FROM, to: TO });

    expect(report.interviewRate).toEqual({ value: 0, insufficientData: true });
    expect(report.weeklyApplications).toEqual([]);
    expect(report.stageDurations).toEqual({
      savedToApplied: null,
      appliedToInterviewing: null,
      interviewingToOutcome: null,
    });
  });
});

describe("computeKpis — stageDurations (KPI-05)", () => {
  it("tem as 3 chaves; média em dias com 1 casa decimal; null quando não há transição concluída", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      job({ id: "b", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ];
    const events: KpiEvent[] = [
      // vaga a: saved→applied em 2 dias; applied→interviewing em 3 dias
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      event({
        id: "e2",
        savedJobId: "a",
        fromStatus: "applied",
        toStatus: "interviewing",
        createdAt: new Date("2026-01-06T00:00:00.000Z"),
      }),
      // vaga b: saved→applied em 5 dias
      event({
        id: "e3",
        savedJobId: "b",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-06T00:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    expect(report.stageDurations).toEqual({
      savedToApplied: 3.5, // média de [2, 5]
      appliedToInterviewing: 3,
      interviewingToOutcome: null,
    });
  });

  it("agrupa interviewing→rejected e interviewing→accepted no balde interviewingToOutcome", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      job({ id: "b", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "interviewing",
        toStatus: "rejected",
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      }),
      event({
        id: "e2",
        savedJobId: "b",
        fromStatus: "interviewing",
        toStatus: "accepted",
        createdAt: new Date("2026-01-09T00:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    // durações: [4, 8] a partir de createdAt 2026-01-01 → média 6
    expect(report.stageDurations.interviewingToOutcome).toBe(6);
  });

  it("cada segmento consecutivo de ida-e-volta do mesmo par conta como uma amostra", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ];
    const events: KpiEvent[] = [
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-03T00:00:00.000Z"), // 2 dias
      }),
      event({
        id: "e2",
        savedJobId: "a",
        fromStatus: "applied",
        toStatus: "saved",
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      }),
      event({
        id: "e3",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2026-01-08T00:00:00.000Z"), // 4 dias após e2
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    expect(report.stageDurations.savedToApplied).toBe(3); // média de [2, 4]
  });

  it("só transições com evento de saída dentro da janela entram no tempo por etapa", () => {
    const savedJobs: KpiSavedJob[] = [
      job({ id: "a", createdAt: new Date("2025-12-20T00:00:00.000Z") }),
    ];
    const events: KpiEvent[] = [
      // saída antes de FROM → NÃO conta em savedToApplied
      event({
        id: "e1",
        savedJobId: "a",
        fromStatus: "saved",
        toStatus: "applied",
        createdAt: new Date("2025-12-28T00:00:00.000Z"),
      }),
      // saída dentro da janela → conta em appliedToInterviewing (a partir de e1)
      event({
        id: "e2",
        savedJobId: "a",
        fromStatus: "applied",
        toStatus: "interviewing",
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      }),
    ];

    const report = computeKpis({ savedJobs, events, from: FROM, to: TO });

    expect(report.stageDurations.savedToApplied).toBeNull();
    expect(report.stageDurations.appliedToInterviewing).toBe(7);
  });
});

describe("computeKpis — range (KPI-09 parcial)", () => {
  it("ecoa range normalizado como YYYY-MM-DD", () => {
    const report = computeKpis({
      savedJobs: [],
      events: [],
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(report.range).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

// ─── Helpers de semana ISO ───────────────────────────────────────────────────

describe("isoWeekStart / isoWeekLabel — bordas ISO-8601", () => {
  it("1º de janeiro de 2026 (quinta) pertence à semana 2026-W01", () => {
    expect(isoWeekLabel(new Date("2026-01-01T12:00:00.000Z"))).toBe("2026-W01");
    expect(isoWeekStart(new Date("2026-01-01T12:00:00.000Z"))).toBe("2025-12-29");
  });

  it("4 de janeiro de 2026 (domingo) ainda é 2026-W01", () => {
    expect(isoWeekLabel(new Date("2026-01-04T00:00:00.000Z"))).toBe("2026-W01");
    expect(isoWeekStart(new Date("2026-01-04T00:00:00.000Z"))).toBe("2025-12-29");
  });

  it("31 de dezembro de 2026 cai na semana ISO 53 de 2026", () => {
    expect(isoWeekLabel(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-W53");
    expect(isoWeekStart(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-28");
  });

  it("1º de janeiro de 2027 ainda pertence a 2026-W53 (virada de ano)", () => {
    expect(isoWeekLabel(new Date("2027-01-01T00:00:00.000Z"))).toBe("2026-W53");
    expect(isoWeekStart(new Date("2027-01-01T00:00:00.000Z"))).toBe("2026-12-28");
  });

  it("ano bissexto: 1º de janeiro de 2024 (segunda) é 2024-W01; 31 de dezembro de 2024 é 2025-W01", () => {
    expect(isoWeekLabel(new Date("2024-01-01T00:00:00.000Z"))).toBe("2024-W01");
    expect(isoWeekStart(new Date("2024-01-01T00:00:00.000Z"))).toBe("2024-01-01");
    expect(isoWeekLabel(new Date("2024-12-31T00:00:00.000Z"))).toBe("2025-W01");
    expect(isoWeekLabel(new Date("2024-02-29T00:00:00.000Z"))).toBe("2024-W09");
  });
});
