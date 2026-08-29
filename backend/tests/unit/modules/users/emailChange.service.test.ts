import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../src/lib/errors";
import { EmailChangeService } from "../../../../src/modules/users/emailChange.service";

const mocks = vi.hoisted(() => ({
  encryptText: vi.fn((value: string) => `encrypted:${value}`),
  decryptText: vi.fn(() => "novo@example.com"),
  generateSearchableHash: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("../../../../src/lib/security/encryption", () => ({
  encryptText: mocks.encryptText,
  decryptText: mocks.decryptText,
}));

vi.mock("../../../../src/lib/security/searchableHash", () => ({
  generateSearchableHash: mocks.generateSearchableHash,
}));

function createDatabase() {
  const tx = {
    query: {
      emailChangeRequests: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      credentials: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    insert: vi.fn(),
  };
  const database = {
    query: {
      users: { findFirst: vi.fn() },
      credentials: { findFirst: vi.fn() },
    },
    transaction: vi.fn(async (callback) => callback(tx)),
  };
  return { database, tx };
}

function setUpdateChain(tx: ReturnType<typeof createDatabase>["tx"]) {
  tx.update.mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      })),
    })),
  }));
  tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
}

describe("EmailChangeService", () => {
  const mailer = {
    sendEmailChangeConfirmation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mailer.sendEmailChangeConfirmation.mockResolvedValue(undefined);
  });

  it("cria o pedido, invalida pedidos anteriores e envia a confirmação", async () => {
    const { database, tx } = createDatabase();
    setUpdateChain(tx);
    database.query.users.findFirst.mockResolvedValue(undefined);
    database.query.credentials.findFirst.mockResolvedValue(undefined);
    tx.query.emailChangeRequests.findFirst.mockResolvedValue(undefined);

    const service = new EmailChangeService(mailer as never, database as never);
    await service.request("user-1", "Novo@Example.com");

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(mailer.sendEmailChangeConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ email: "novo@example.com" }),
    );
  });

  it("rejeita e-mail já em uso", async () => {
    const { database } = createDatabase();
    database.query.users.findFirst.mockResolvedValue({ id: "other-user" });
    database.query.credentials.findFirst.mockResolvedValue(undefined);
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.request("user-1", "novo@example.com")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("propaga falha ao enfileirar a confirmaÃ§Ã£o", async () => {
    const { database, tx } = createDatabase();
    setUpdateChain(tx);
    database.query.users.findFirst.mockResolvedValue(undefined);
    database.query.credentials.findFirst.mockResolvedValue(undefined);
    tx.query.emailChangeRequests.findFirst.mockResolvedValue(undefined);
    mailer.sendEmailChangeConfirmation.mockRejectedValueOnce(
      new Error("Valkey indisponÃ­vel"),
    );
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.request("user-1", "novo@example.com")).rejects.toThrow(
      "Valkey indisponÃ­vel",
    );
  });

  it.each([undefined, { invalidatedAt: new Date() }, { expiresAt: new Date(0) }])(
    "rejeita token inválido ou expirado",
    async (request) => {
      const { database, tx } = createDatabase();
      tx.query.emailChangeRequests.findFirst.mockResolvedValue(request);
      const service = new EmailChangeService(mailer as never, database as never);

      await expect(service.confirm("token")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Token inválido ou expirado.",
      } satisfies Partial<AppError>);
    },
  );

  it("efetiva a troca apenas para um token válido", async () => {
    const { database, tx } = createDatabase();
    setUpdateChain(tx);
    tx.query.emailChangeRequests.findFirst.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      newEmailEncrypted: "encrypted:novo@example.com",
      newEmailHash: "hash:novo@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      invalidatedAt: null,
      confirmedAt: null,
    });
    tx.query.users.findFirst.mockResolvedValue(undefined);
    tx.query.credentials.findFirst.mockResolvedValue(undefined);
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.confirm("token")).resolves.toBeUndefined();
    expect(tx.update).toHaveBeenCalledTimes(3);
  });
});
