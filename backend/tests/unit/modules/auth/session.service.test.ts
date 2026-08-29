import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertReturning: vi.fn(),
  updateReturning: vi.fn(),
  selectOrderBy: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("../../../../src/db/client", () => ({
  db: {
    query: { userSessions: { findFirst: mocks.findFirst } },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: mocks.insertReturning })),
    })),
    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        mocks.updateSet(...args);
        return { where: vi.fn(() => ({ returning: mocks.updateReturning })) };
      },
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ orderBy: mocks.selectOrderBy })),
      })),
    })),
  },
}));

import { describeDevice, SessionService } from "../../../../src/modules/auth/session.service";

describe("SessionService", () => {
  const service = new SessionService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SESSION_TTL_SECONDS", "3600");
  });

  it("cria sessão com metadados e expiração", async () => {
    mocks.insertReturning.mockResolvedValue([{ id: "session-1" }]);

    await expect(
      service.create("user-1", { userAgent: "Chrome", ipAddress: "127.0.0.1" }),
    ).resolves.toEqual({ id: "session-1" });
  });

  it("considera inválida uma sessão sem identificador ou não encontrada", async () => {
    await expect(service.isActive("user-1")).resolves.toBe(false);
    mocks.findFirst.mockResolvedValue(undefined);
    await expect(service.isActive("user-1", "session-1")).resolves.toBe(false);
  });

  it("atualiza o último acesso de uma sessão válida", async () => {
    mocks.findFirst.mockResolvedValue({ id: "session-1" });
    await expect(service.isActive("user-1", "session-1")).resolves.toBe(true);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    );
  });

  it("lista apenas as sessões ativas e identifica a atual", async () => {
    const now = new Date("2026-08-29T12:00:00.000Z");
    mocks.selectOrderBy.mockResolvedValue([
      {
        id: "current", userAgent: "Mozilla/5.0 Chrome/120.0 Windows", ipAddress: "127.0.0.1",
        createdAt: now, lastSeenAt: now, expiresAt: now,
      },
    ]);

    await expect(service.list("user-1", "current")).resolves.toEqual([
      expect.objectContaining({ id: "current", isCurrent: true, device: "Google Chrome em Windows" }),
    ]);
  });

  it("revoga somente sessão ativa do mesmo usuário", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "session-1" }]);
    await expect(service.revoke("user-1", "session-1")).resolves.toBe(true);
    mocks.updateReturning.mockResolvedValue([]);
    await expect(service.revoke("user-1", "other-user-session")).resolves.toBe(false);
  });

  it("revoga todas as outras sessões, preservando a atual", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "other" }]);

    await expect(service.revokeOthers("user-1", "current")).resolves.toBe(1);
  });

  it("não revoga sessões sem identificar a sessão atual", async () => {
    await expect(service.revokeOthers("user-1")).resolves.toBe(0);
    expect(mocks.updateReturning).not.toHaveBeenCalled();
  });
});

describe("describeDevice", () => {
  it("apresenta um nome útil para navegador e plataforma", () => {
    expect(describeDevice("Mozilla/5.0 Firefox/120.0 Linux")).toBe("Firefox em Linux");
    expect(describeDevice(null)).toBe("Dispositivo desconhecido");
  });
});
