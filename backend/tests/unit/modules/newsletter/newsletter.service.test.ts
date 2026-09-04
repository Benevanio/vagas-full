import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  usersFindFirst: vi.fn(),
  newsletterSendsFindFirst: vi.fn(),
  selectWhere: vi.fn(),
  insertValues: vi.fn(),
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

const cacheClientMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

const emailServiceMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

const unsubscribeTokenMocks = vi.hoisted(() => ({
  generateUnsubscribeToken: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

const mapperMocks = vi.hoisted(() => ({
  toPublicUser: vi.fn(),
}));

vi.mock("../../../../src/db/client", () => ({
  db: {
    query: {
      users: { findFirst: dbMocks.usersFindFirst },
      newsletterSends: { findFirst: dbMocks.newsletterSendsFindFirst },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: dbMocks.selectWhere })),
    })),
    insert: vi.fn(() => ({ values: dbMocks.insertValues })),
  },
}));

vi.mock("../../../../src/db/schema", () => ({
  users: { id: "users.id" },
  newsletterSends: {
    userId: "newsletterSends.userId",
    isoWeek: "newsletterSends.isoWeek",
    createdAt: "newsletterSends.createdAt",
    sentJobIds: "newsletterSends.sentJobIds",
    status: "newsletterSends.status",
  },
  savedJobs: {
    userId: "savedJobs.userId",
    status: "savedJobs.status",
  },
  userPreferences: {
    userId: "userPreferences.userId",
    emailNotifications: "userPreferences.emailNotifications",
  },
}));

vi.mock("../../../../src/lib/cache", () => ({
  cacheAbsoluteSMembers: cacheMocks.cacheAbsoluteSMembers,
  cacheGetJobsByIds: cacheMocks.cacheGetJobsByIds,
  getCache: vi.fn(async () => cacheClientMocks),
}));

vi.mock("../../../../src/modules/email/email.service", () => ({
  emailService: emailServiceMocks,
}));

vi.mock("../../../../src/lib/security/unsubscribeToken", () => ({
  generateUnsubscribeToken: unsubscribeTokenMocks.generateUnsubscribeToken,
}));

vi.mock("../../../../src/config", () => ({
  getConfig: configMocks.getConfig,
}));

vi.mock("../../../../src/logger", () => ({
  logWarn: loggerMocks.logWarn,
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../../../src/modules/users/users.mapper", () => ({
  toPublicUser: mapperMocks.toPublicUser,
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

import {
  computeMatchedJobsForUser,
  getIsoWeek,
  getRecentlySentJobIds,
  sendForUser,
} from "../../../../src/modules/newsletter/newsletter.service";

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

describe("newsletter.service — getIsoWeek", () => {
  it.each([
    ["2026-08-31T12:00:00Z", "2026-W36"],
    ["2026-09-03T12:00:00Z", "2026-W36"],
    ["2026-01-01T12:00:00Z", "2026-W01"],
    // Virada de ano: 31/dez/2020 (quinta) pertence à semana 53 de 2020.
    ["2020-12-31T12:00:00Z", "2020-W53"],
    // 1/jan/2021 (sexta) ainda pertence à semana 53 do ano ISO 2020.
    ["2021-01-01T12:00:00Z", "2020-W53"],
    ["2021-01-04T12:00:00Z", "2021-W01"],
    // 30/dez/2019 (segunda) já pertence à semana 1 do ano ISO 2020.
    ["2019-12-30T12:00:00Z", "2020-W01"],
  ])("retorna a semana ISO correta para %s", (isoDate, expected) => {
    expect(getIsoWeek(new Date(isoDate))).toBe(expected);
  });
});

describe("newsletter.service — getRecentlySentJobIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("agrega sentJobIds das últimas weeksBack semanas sem duplicar (NEWSL-09)", async () => {
    dbMocks.selectWhere.mockResolvedValue([
      { sentJobIds: ["job-1", "job-2"] },
      { sentJobIds: ["job-2", "job-3"] },
    ]);

    const result = await getRecentlySentJobIds("user-1", 8);

    expect(result.sort()).toEqual(["job-1", "job-2", "job-3"]);
  });

  it("retorna [] quando o usuário não tem histórico de envio", async () => {
    dbMocks.selectWhere.mockResolvedValue([]);

    const result = await getRecentlySentJobIds("user-1", 8);

    expect(result).toEqual([]);
  });
});

describe("newsletter.service — sendForUser", () => {
  const rawUser = { id: "user-1", emailEncrypted: "enc" };
  const publicUser = {
    id: "user-1",
    email: "user@example.com",
    displayName: "Ana",
    firstName: "Ana",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.newsletterSendsFindFirst.mockResolvedValue(undefined);
    dbMocks.usersFindFirst.mockResolvedValue(rawUser);
    mapperMocks.toPublicUser.mockReturnValue(publicUser);
    jobMatchMocks.getUserMatchTechnologies.mockReturnValue([
      { name: "Node.js", years: 3 },
    ]);
    cacheMocks.cacheAbsoluteSMembers.mockResolvedValue(["job-1"]);
    cacheMocks.cacheGetJobsByIds.mockResolvedValue([{ id: "job-1", title: "Vaga 1" }]);
    jobMatchMocks.scoreJobWithTechnologies.mockImplementation((job) => ({
      ...job,
      matchScore: 80,
    }));
    // 1ª chamada de db.select: getRecentlySentJobIds (excludeJobIds).
    // 2ª chamada: countApplications (appliedCount).
    // mockReset() descarta qualquer valor "Once" não consumido em um teste
    // anterior (ex.: quando matchedJobs vem vazio, countApplications nunca
    // roda e deixaria a 2ª fila pendente pro próximo teste).
    dbMocks.selectWhere
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value: 4 }]);
    cacheClientMocks.get.mockResolvedValue(
      JSON.stringify([{ title: "Notícia", link: "https://n.com/1" }]),
    );
    unsubscribeTokenMocks.generateUnsubscribeToken.mockReturnValue("TOKEN123");
    configMocks.getConfig.mockReturnValue({ frontendUrl: "https://app.com" });
    emailServiceMocks.send.mockResolvedValue(undefined);
    dbMocks.insertValues.mockResolvedValue(undefined);
  });

  it("não chama emailService.send quando já existe newsletter_sends pra (userId, isoWeek) — idempotência", async () => {
    dbMocks.newsletterSendsFindFirst.mockResolvedValue({
      id: "existing",
      userId: "user-1",
      isoWeek: "2026-W36",
    });

    await sendForUser("user-1", "2026-W36");

    expect(emailServiceMocks.send).not.toHaveBeenCalled();
    expect(dbMocks.usersFindFirst).not.toHaveBeenCalled();
  });

  it("grava status=skipped_no_match e não envia e-mail quando não há vaga com match", async () => {
    cacheMocks.cacheAbsoluteSMembers.mockResolvedValue([]);

    await sendForUser("user-1", "2026-W36");

    expect(emailServiceMocks.send).not.toHaveBeenCalled();
    expect(dbMocks.insertValues).toHaveBeenCalledWith({
      userId: "user-1",
      isoWeek: "2026-W36",
      status: "skipped_no_match",
      sentJobIds: [],
    });
  });

  it("envia a newsletter com matchedJobs, appliedCount, news e unsubscribeUrl quando há match (NEWSL-01/05/06/12)", async () => {
    await sendForUser("user-1", "2026-W36");

    expect(emailServiceMocks.send).toHaveBeenCalledWith({
      template: "newsletter",
      to: "user@example.com",
      data: {
        name: "Ana",
        matchedJobs: [{ id: "job-1", title: "Vaga 1", matchScore: 80 }],
        appliedCount: 4,
        news: [{ title: "Notícia", link: "https://n.com/1" }],
        unsubscribeUrl: "https://app.com/newsletter/unsubscribe?token=TOKEN123",
        appUrl: "https://app.com",
      },
    });
  });

  it("grava newsletter_sends com status=sent e sentJobIds das vagas enviadas", async () => {
    await sendForUser("user-1", "2026-W36");

    expect(dbMocks.insertValues).toHaveBeenCalledWith({
      userId: "user-1",
      isoWeek: "2026-W36",
      status: "sent",
      sentJobIds: ["job-1"],
    });
  });

  it("loga aviso e retorna sem lançar quando o usuário não é encontrado (excluído no meio do processamento)", async () => {
    dbMocks.usersFindFirst.mockResolvedValue(undefined);

    await expect(sendForUser("user-1", "2026-W36")).resolves.toBeUndefined();

    expect(emailServiceMocks.send).not.toHaveBeenCalled();
    expect(loggerMocks.logWarn).toHaveBeenCalled();
  });

  it("loga aviso e retorna sem lançar quando o usuário não tem e-mail válido", async () => {
    mapperMocks.toPublicUser.mockReturnValue({ ...publicUser, email: null });

    await expect(sendForUser("user-1", "2026-W36")).resolves.toBeUndefined();

    expect(emailServiceMocks.send).not.toHaveBeenCalled();
    expect(loggerMocks.logWarn).toHaveBeenCalled();
  });

  it("usa news: [] quando o snapshot de notícias está ausente no Valkey, sem impedir o envio", async () => {
    cacheClientMocks.get.mockResolvedValue(null);

    await sendForUser("user-1", "2026-W36");

    expect(emailServiceMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ news: [] }) }),
    );
  });
});
