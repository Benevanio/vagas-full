import { beforeEach, describe, expect, it, vi } from "vitest";

const drizzleMocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  asc: vi.fn((column: unknown) => ({ asc: column })),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: drizzleMocks.eq,
    asc: drizzleMocks.asc,
  };
});

const dbMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("../../../../src/db/client", () => ({
  db: {
    select: vi.fn(() => ({ from: dbMocks.from })),
  },
}));

import { applicationEvents, savedJobs } from "../../../../src/db/schema";
import { ReportsRepository } from "../../../../src/modules/reports/reports.repository";

describe("ReportsRepository", () => {
  const userId = "user-1";

  const jobRows = [
    {
      id: "job-1",
      status: "saved",
      appliedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  const eventRows = [
    {
      id: "event-1",
      savedJobId: "job-1",
      fromStatus: "saved",
      toStatus: "applied",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ];

  const whereForJobs = vi.fn();
  const whereForEvents = vi.fn();
  const orderByForEvents = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    whereForJobs.mockResolvedValue(jobRows);
    orderByForEvents.mockResolvedValue(eventRows);
    whereForEvents.mockReturnValue({ orderBy: orderByForEvents });

    dbMocks.from.mockImplementation((table: unknown) => {
      if (table === savedJobs) return { where: whereForJobs };
      if (table === applicationEvents) return { where: whereForEvents };
      throw new Error("unexpected table passed to from()");
    });
  });

  it("busca as vagas do usuário filtrando por user_id (KPI-06)", async () => {
    const result = await new ReportsRepository().fetchUserActivity(userId);

    expect(result.savedJobs).toEqual(jobRows);
    expect(drizzleMocks.eq).toHaveBeenCalledWith(savedJobs.userId, userId);
    expect(whereForJobs).toHaveBeenCalled();
  });

  it("busca os eventos do usuário filtrando por user_id, ordenados por created_at,id (KPI-06)", async () => {
    const result = await new ReportsRepository().fetchUserActivity(userId);

    expect(result.events).toEqual(eventRows);
    expect(drizzleMocks.eq).toHaveBeenCalledWith(
      applicationEvents.userId,
      userId,
    );
    expect(drizzleMocks.asc).toHaveBeenNthCalledWith(
      1,
      applicationEvents.createdAt,
    );
    expect(drizzleMocks.asc).toHaveBeenNthCalledWith(2, applicationEvents.id);
    expect(orderByForEvents).toHaveBeenCalled();
  });

  it("nunca mistura o filtro de um usuário com o de outro (chamadas independentes)", async () => {
    await new ReportsRepository().fetchUserActivity("user-a");
    await new ReportsRepository().fetchUserActivity("user-b");

    expect(drizzleMocks.eq).toHaveBeenCalledWith(savedJobs.userId, "user-a");
    expect(drizzleMocks.eq).toHaveBeenCalledWith(savedJobs.userId, "user-b");
  });
});
