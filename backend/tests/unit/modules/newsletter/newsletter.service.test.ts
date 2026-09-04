import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  usersFindFirst: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  cacheAbsoluteSMembers: vi.fn(),
  cacheGetJobsByIds: vi.fn(),
}));

const jobMatchMocks = vi.hoisted(() => ({
  getUserMatchTechnologies: vi.fn(),
  scoreJobWithTechnologies: vi.fn(),
}));

const notificationsMocks = vi.hoisted(() => ({
  createHighMatchIfMissing: vi.fn(),
}));

vi.mock("../../../../src/db/client", () => ({
  db: {
    query: {
      users: { findFirst: dbMocks.usersFindFirst },
    },
  },
}));

vi.mock("../../../../src/db/schema", () => ({
  users: { id: "users.id" },
}));

vi.mock("../../../../src/lib/cache", () => ({
  cacheAbsoluteSMembers: cacheMocks.cacheAbsoluteSMembers,
  cacheGetJobsByIds: cacheMocks.cacheGetJobsByIds,
}));

vi.mock("../../../../src/modules/jobs/services/jobMatch.service", () => ({
  getUserMatchTechnologies: jobMatchMocks.getUserMatchTechnologies,
  scoreJobWithTechnologies: jobMatchMocks.scoreJobWithTechnologies,
}));

vi.mock("../../../../src/modules/notifications/notifications.service", () => ({
  NotificationsService: class {
    createHighMatchIfMissing = notificationsMocks.createHighMatchIfMissing;
  },
}));

import { computeMatchedJobsForUser } from "../../../../src/modules/newsletter/newsletter.service";

describe("newsletter.service — computeMatchedJobsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.usersFindFirst.mockResolvedValue({ id: "user-1" });
    jobMatchMocks.getUserMatchTechnologies.mockReturnValue([
      { name: "Node.js", years: 3 },
    ]);
    cacheMocks.cacheAbsoluteSMembers.mockResolvedValue(["job-1", "job-2", "job-3"]);
    cacheMocks.cacheGetJobsByIds.mockResolvedValue([
      { id: "job-1", title: "Vaga 1" },
      { id: "job-2", title: "Vaga 2" },
      { id: "job-3", title: "Vaga 3" },
    ]);
    jobMatchMocks.scoreJobWithTechnologies.mockImplementation((job) => {
      const scores: Record<string, number> = { "job-1": 60, "job-2": 90, "job-3": 75 };
      return { ...job, matchScore: scores[job.id as string] ?? 0 };
    });
  });

  it("retorna vagas com matchScore > 0 ordenadas desc, cortadas em `limit` (NEWSL-02)", async () => {
    const result = await computeMatchedJobsForUser("user-1", [], 2);

    expect(result).toHaveLength(2);
    expect(result.map((job) => job.id)).toEqual(["job-2", "job-3"]);
    expect(result[0].matchScore).toBe(90);
    expect(result[1].matchScore).toBe(75);
  });

  it("nunca inclui vagas presentes em excludeJobIds", async () => {
    const result = await computeMatchedJobsForUser("user-1", ["job-2"], 5);

    expect(result.map((job) => job.id)).not.toContain("job-2");
    expect(result.map((job) => job.id)).toEqual(["job-3", "job-1"]);
  });

  it("retorna [] quando o usuário não tem tecnologias no perfil", async () => {
    jobMatchMocks.getUserMatchTechnologies.mockReturnValue([]);

    const result = await computeMatchedJobsForUser("user-1", [], 5);

    expect(result).toEqual([]);
    expect(cacheMocks.cacheAbsoluteSMembers).not.toHaveBeenCalled();
  });

  it("retorna [] quando o índice global de vagas está vazio", async () => {
    cacheMocks.cacheAbsoluteSMembers.mockResolvedValue([]);

    const result = await computeMatchedJobsForUser("user-1", [], 5);

    expect(result).toEqual([]);
    expect(cacheMocks.cacheGetJobsByIds).not.toHaveBeenCalled();
  });

  it("filtra vagas com matchScore <= 0", async () => {
    jobMatchMocks.scoreJobWithTechnologies.mockImplementation((job) => ({
      ...job,
      matchScore: job.id === "job-2" ? 0 : 50,
    }));

    const result = await computeMatchedJobsForUser("user-1", [], 5);

    expect(result.map((job) => job.id)).not.toContain("job-2");
  });

  it("nunca dispara notificação de alto match (não usa JobProfileMatchService.enrich)", async () => {
    await computeMatchedJobsForUser("user-1", [], 5);

    expect(notificationsMocks.createHighMatchIfMissing).not.toHaveBeenCalled();
  });
});
