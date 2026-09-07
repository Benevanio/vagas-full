import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../src/lib/errors";
import { emailChangeRequests } from "../../../../src/db/schema";
import { EmailChangeService } from "../../../../src/modules/users/emailChange.service";

const mocks = vi.hoisted(() => ({
  encryptText: vi.fn((value: string) => `encrypted:${value}`),
  decryptText: vi.fn(() => "novo@example.com"),
  generateSearchableHash: vi.fn((value: string) => `hash:${value}`),
}));

const drizzleMocks = vi.hoisted(() => ({
  isNull: vi.fn((column: unknown) => ({ op: "isNull", column })),
  gt: vi.fn((column: unknown, value: unknown) => ({ op: "gt", column, value })),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, isNull: drizzleMocks.isNull, gt: drizzleMocks.gt };
});

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

function setUpdateChain(
  tx: ReturnType<typeof createDatabase>["tx"],
  returningQueue: unknown[][] = [],
) {
  // `returning` é compartilhado entre os updates da transação, então dá pra
  // enfileirar o retorno de cada um na ordem em que o serviço os executa.
  const returning = vi.fn();
  for (const value of returningQueue) returning.mockResolvedValueOnce(value);
  returning.mockResolvedValue([{ id: "user-1" }]);

  const setSpy = vi.fn();
  tx.update.mockImplementation(() => ({
    set: vi.fn((values: unknown) => {
      setSpy(values);
      return { where: vi.fn(() => ({ returning })) };
    }),
  }));
  tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  return { returning, setSpy };
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

  it("rejeita quando a reivindicação não encontra solicitação ativa", async () => {
    const { database, tx } = createDatabase();
    // Token inexistente, expirado, já confirmado ou invalidado: em todos os
    // casos quem filtra é o WHERE do UPDATE, então nenhuma linha volta.
    setUpdateChain(tx, [[]]);
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.confirm("token")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Token inválido ou expirado.",
    } satisfies Partial<AppError>);
  });

  it("reivindica a solicitação revalidando o estado no próprio UPDATE", async () => {
    const { database, tx } = createDatabase();
    const { setSpy } = setUpdateChain(tx, [[]]);
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.confirm("token")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    // O UPDATE que marca `confirmedAt` é o mesmo que revalida o estado — é
    // isso que fecha a janela entre ler a solicitação e confirmá-la.
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ confirmedAt: expect.any(Date) }),
    );
    expect(drizzleMocks.isNull).toHaveBeenCalledWith(
      emailChangeRequests.invalidatedAt,
    );
    expect(drizzleMocks.isNull).toHaveBeenCalledWith(
      emailChangeRequests.confirmedAt,
    );
    expect(drizzleMocks.gt).toHaveBeenCalledWith(
      emailChangeRequests.expiresAt,
      expect.any(Date),
    );
  });

  it("efetiva a troca apenas para um token válido", async () => {
    const { database, tx } = createDatabase();
    // 1º returning = reivindicação da solicitação; 2º = update do usuário.
    setUpdateChain(tx, [
      [
        {
          id: "request-1",
          userId: "user-1",
          newEmailEncrypted: "encrypted:novo@example.com",
          newEmailHash: "hash:novo@example.com",
          expiresAt: new Date(Date.now() + 60_000),
          invalidatedAt: null,
          confirmedAt: null,
        },
      ],
      [{ id: "user-1" }],
    ]);
    tx.query.users.findFirst.mockResolvedValue(undefined);
    tx.query.credentials.findFirst.mockResolvedValue(undefined);
    const service = new EmailChangeService(mailer as never, database as never);

    await expect(service.confirm("token")).resolves.toBeUndefined();
    expect(tx.update).toHaveBeenCalledTimes(3);
  });
});
