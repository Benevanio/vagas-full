import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração real de schema → service → repository → core para o preset
 * "Tudo" (all=true) — a única camada mockada é o cliente de banco (não há
 * harness de banco real neste repo). Isso prova que "Tudo" de fato calcula
 * o histórico completo a partir da atividade real do usuário, e não apenas
 * que cada camada isolada faz a sua parte (é o que o `reports.routes.test.ts`,
 * com o `ReportsService` mockado, não consegue provar sozinho).
 */

const drizzleMocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  asc: vi.fn((column: unknown) => ({ asc: column })),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: drizzleMocks.eq, asc: drizzleMocks.asc };
});

const dbMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("../../src/db/client", () => ({
  db: { select: vi.fn(() => ({ from: dbMocks.from })) },
}));

import { applicationEvents, savedJobs } from "../../src/db/schema";
import { buildReportsKpisQuerySchema } from "../../src/modules/reports/schemas/reports.schemas";
import { ReportsService } from "../../src/modules/reports/reports.service";

const NOW = new Date("2026-03-15T12:00:00.000Z");
const userId = "user-abc";

describe("Integração — preset 'Tudo' calcula o histórico completo de verdade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all=true retorna range.from na atividade mais antiga do usuário, não nos últimos 90 dias", async () => {
    const oldestJobDate = new Date("2024-01-10T00:00:00.000Z"); // > 90 dias antes de NOW

    dbMocks.from.mockImplementation((table: unknown) => {
      if (table === savedJobs) {
        return {
          where: vi.fn().mockResolvedValue([
            {
              id: "job-1",
              status: "applied",
              appliedAt: null,
              createdAt: oldestJobDate,
            },
            {
              id: "job-2",
              status: "saved",
              appliedAt: null,
              createdAt: new Date("2026-02-01T00:00:00.000Z"),
            },
          ]),
        };
      }
      if (table === applicationEvents) {
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "event-1",
                savedJobId: "job-1",
                fromStatus: "saved",
                toStatus: "applied",
                createdAt: new Date("2024-01-12T00:00:00.000Z"),
              },
            ]),
          }),
        };
      }
      throw new Error("unexpected table");
    });

    const schema = buildReportsKpisQuerySchema(NOW);
    const query = schema.parse({ all: "true" });

    const service = new ReportsService();
    const report = await service.getKpis(userId, query);

    // O mais antigo é job-1 (2024-01-10), anterior ao evento (2024-01-12) e
    // muito anterior aos 90 dias default (que começariam em 2025-12-15).
    expect(report.range.from).toBe("2024-01-10");
    expect(report.range.to).toBe("2026-03-15");
  });

  it("all=true sem nenhuma atividade não quebra — range vira um dia vazio terminando em 'to'", async () => {
    dbMocks.from.mockImplementation((table: unknown) => {
      if (table === savedJobs) return { where: vi.fn().mockResolvedValue([]) };
      if (table === applicationEvents) {
        return { where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) }) };
      }
      throw new Error("unexpected table");
    });

    const schema = buildReportsKpisQuerySchema(NOW);
    const query = schema.parse({ all: "true" });

    const service = new ReportsService();
    const report = await service.getKpis(userId, query);

    expect(report.range).toEqual({ from: "2026-03-15", to: "2026-03-15" });
    expect(report.interviewRate).toEqual({ value: 0, insufficientData: true });
  });
});
