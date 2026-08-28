import { beforeEach, describe, expect, it, vi } from "vitest";

const { toPublicUser } = vi.hoisted(() => ({
  toPublicUser: vi.fn(),
}));

vi.mock("../../../../src/modules/users/users.mapper", () => ({
  toPublicUser,
}));

import { PrivacyService } from "../../../../src/modules/users/privacy.service";

function makeDatabase() {
  const select = vi.fn();
  const remove = vi.fn();

  return {
    query: {
      users: { findFirst: vi.fn() },
      userPreferences: { findFirst: vi.fn() },
    },
    select,
    delete: remove,
  };
}

function selectResult(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe("PrivacyService", () => {
  let database: ReturnType<typeof makeDatabase>;
  let service: PrivacyService;

  beforeEach(() => {
    database = makeDatabase();
    service = new PrivacyService(database as any);
    toPublicUser.mockReset();
  });

  it("exporta os dados próprios sem campos criptografados ou hashes", async () => {
    database.query.users.findFirst.mockResolvedValue({ id: "user-1" });
    database.query.userPreferences.findFirst.mockResolvedValue({ theme: "dark" });
    database.select
      .mockReturnValueOnce(selectResult([{ id: "job-1" }]))
      .mockReturnValueOnce(selectResult([{ id: "notification-1" }]))
      .mockReturnValueOnce(selectResult([{ id: "event-1" }]))
      .mockReturnValueOnce(selectResult([{ id: "keyword-1" }]))
      .mockReturnValueOnce(selectResult([{ provider: "google" }]));
    toPublicUser.mockReturnValue({
      id: "user-1",
      email: "pessoa@example.com",
      emailEncrypted: "ciphertext",
      emailHash: "hash",
      cpfEncrypted: "ciphertext",
      cpfHash: "hash",
    });

    const result = await service.exportUserData("user-1");

    expect(result).toMatchObject({
      profile: { id: "user-1", email: "pessoa@example.com" },
      preferences: { theme: "dark" },
      savedJobs: [{ id: "job-1" }],
      notifications: [{ id: "notification-1" }],
      applicationEvents: [{ id: "event-1" }],
      keywords: [{ id: "keyword-1" }],
      connectedAccounts: [{ provider: "google" }],
    });
    expect(result.profile).not.toHaveProperty("emailEncrypted");
    expect(result.profile).not.toHaveProperty("emailHash");
    expect(result.profile).not.toHaveProperty("cpfEncrypted");
    expect(result.profile).not.toHaveProperty("cpfHash");
  });

  it("recusa exportar dados de usuário inexistente", async () => {
    database.query.users.findFirst.mockResolvedValue(undefined);

    await expect(service.exportUserData("inexistente")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("exclui a conta e retorna not found quando ela não existe", async () => {
    const returning = vi.fn().mockResolvedValueOnce([{ id: "user-1" }]).mockResolvedValueOnce([]);
    database.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });

    await expect(service.deleteAccount("user-1")).resolves.toBeUndefined();
    await expect(service.deleteAccount("inexistente")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });
});
