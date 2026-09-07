import { describe, expect, it } from "vitest";
import { buildReportsKpisQuerySchema } from "../../../../src/modules/reports/schemas/reports.schemas";

const NOW = new Date("2026-03-15T14:30:00.000Z");

describe("buildReportsKpisQuerySchema — defaults (KPI-09)", () => {
  it("sem query, usa janela dos últimos 90 dias até hoje (UTC)", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({});

    expect(result).toEqual({
      all: false,
      from: new Date("2025-12-15T00:00:00.000Z"),
      to: new Date("2026-03-15T23:59:59.999Z"),
    });
  });

  it("com from/to válidos, ancora a janela em [00:00:00.000Z, 23:59:59.999Z]", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ from: "2026-01-01", to: "2026-01-31" });

    expect(result).toEqual({
      all: false,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-31T23:59:59.999Z"),
    });
  });

  it("só 'to' informado, calcula 'from' como to - 90 dias", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ to: "2026-02-01" });

    expect(result).toEqual({
      all: false,
      from: new Date("2025-11-03T00:00:00.000Z"),
      to: new Date("2026-02-01T23:59:59.999Z"),
    });
  });

  it("só 'from' informado, usa 'hoje' como 'to'", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ from: "2026-01-01" });

    expect(result).toEqual({
      all: false,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-15T23:59:59.999Z"),
    });
  });

  it("from == to é aceito (janela de um único dia)", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ from: "2026-02-10", to: "2026-02-10" });

    expect(result).toEqual({
      all: false,
      from: new Date("2026-02-10T00:00:00.000Z"),
      to: new Date("2026-02-10T23:59:59.999Z"),
    });
  });
});

describe("buildReportsKpisQuerySchema — rejeições (KPI-08)", () => {
  it("rejeita from > to", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    expect(() => schema.parse({ from: "2026-02-01", to: "2026-01-01" })).toThrow();
  });

  it("rejeita formato fora de YYYY-MM-DD", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    expect(() => schema.parse({ from: "01/01/2026" })).toThrow();
    expect(() => schema.parse({ to: "2026-1-1" })).toThrow();
  });

  it("rejeita data de calendário inexistente", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    expect(() => schema.parse({ from: "2026-02-30" })).toThrow();
  });
});

describe("buildReportsKpisQuerySchema — all=true (preset 'Tudo')", () => {
  it("all=true sem from/to retorna só { all: true, to } — sem janela de 90 dias", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ all: "true" });

    expect(result).toEqual({ all: true, to: new Date("2026-03-15T23:59:59.999Z") });
    expect(result).not.toHaveProperty("from");
  });

  it("all=true com 'to' explícito respeita o 'to' informado", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ all: "true", to: "2026-02-01" });

    expect(result).toEqual({ all: true, to: new Date("2026-02-01T23:59:59.999Z") });
  });

  it("all=true ignora um 'from' enviado junto (all tem prioridade)", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ all: "true", from: "2026-01-01" });

    expect(result).toEqual({ all: true, to: new Date("2026-03-15T23:59:59.999Z") });
  });

  it("all=false explícito se comporta como ausente (janela por data)", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    const result = schema.parse({ all: "false" });

    expect(result.all).toBe(false);
  });

  it("all inválido (fora de 'true'/'false') é rejeitado", () => {
    const schema = buildReportsKpisQuerySchema(NOW);
    expect(() => schema.parse({ all: "sim" })).toThrow();
  });
});
