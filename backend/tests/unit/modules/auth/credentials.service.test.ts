import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // db.query.*
  credentialsFindFirst: vi.fn(),
  usersFindFirst: vi.fn(),
  // db.insert chain triggers
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  transaction: vi.fn(),
  // argon2
  hash: vi.fn(),
  verify: vi.fn(),
  // generateUsername
  generateUsername: vi.fn(),
  // email de boas-vindas
  sendWelcome: vi.fn(),
}));

// ─── Mock: database client ────────────────────────────────────────────────────

vi.mock("../../../../src/db/client", () => {
  const chain = {
    values: mocks.insertValues.mockImplementation(() => chain),
    returning: mocks.insertReturning,
  };

  const db = {
    query: {
      credentials: { findFirst: mocks.credentialsFindFirst },
      users: { findFirst: mocks.usersFindFirst },
    },
    insert: vi.fn(() => chain),
    transaction: mocks.transaction,
  };

  return {
    db,
  };
});

// ─── Mock: Pacote Oficial "argon2" ───────────────────────────────────────────

vi.mock("argon2", () => ({
  argon2id: 2,
  hash: mocks.hash,
  verify: mocks.verify,
}));

// ─── Mock: generateUsername ───────────────────────────────────────────────────

vi.mock("../../../../src/utils/generateUsername", () => ({
  generateUsername: mocks.generateUsername,
}));

// ─── Mock: EmailService (boas-vindas) ─────────────────────────────────────────

vi.mock("../../../../src/modules/email/email.service", () => ({
  emailService: {
    sendWelcome: mocks.sendWelcome,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { CredentialsService } from "../../../../src/modules/auth/credentials.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  id: "uuid-user-1",
  email: "test@example.com",
  username: "testuser",
  displayName: "Test User",
  emailVerified: false,
  role: "user",
};

const mockCredential = {
  id: "cred-1",
  userId: "uuid-user-1",
  email: "test@example.com",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$hashedpassword",
};

const registerInput = {
  email: "new@example.com",
  password: "Senha@123",
  name: "Novo Usuário",
};

const loginInput = {
  email: "test@example.com",
  password: "Senha@123",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CredentialsService", () => {
  let service: CredentialsService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Garante o comportamento fluído e infinito do builder do Drizzle
    mocks.insertValues.mockImplementation(() => {
      return {
        returning: mocks.insertReturning,
      };
    });
    mocks.insertReturning.mockResolvedValue([mockUser]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        insert: vi.fn(() => ({
          values: mocks.insertValues.mockImplementation(() => ({
            returning: mocks.insertReturning,
          })),
        })),
        query: {
          credentials: { findFirst: mocks.credentialsFindFirst },
          users: { findFirst: mocks.usersFindFirst },
        },
      }),
    );

    // Define retornos seguros e limpos para evitar falhas colaterais
    mocks.credentialsFindFirst.mockResolvedValue(null);
    mocks.usersFindFirst.mockResolvedValue(null);
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("$argon2id$hashed");
    mocks.generateUsername.mockResolvedValue("mocked-username");
    mocks.sendWelcome.mockResolvedValue(undefined);

    service = new CredentialsService();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe("register", () => {
    it("cria usuário e retorna user + session quando email não existe", async () => {
      const result = await service.register(registerInput);

      expect(result.user).toMatchObject({ email: mockUser.email });
      expect(result.session).toEqual({ userId: mockUser.id, role: "user" });
    });

    it("lança CONFLICT quando credential já existe para o email", async () => {
      mocks.credentialsFindFirst.mockResolvedValue(mockCredential);

      await expect(service.register(registerInput)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Email já cadastrado",
      });

      expect(mocks.hash).not.toHaveBeenCalled();
    });

    it("lança CONFLICT quando user já existe para o email (sem credential)", async () => {
      mocks.usersFindFirst.mockResolvedValue(mockUser);

      await expect(service.register(registerInput)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Email já cadastrado",
      });
    });

    it("usa o prefixo do email como base do username quando name é omitido", async () => {
      // Aqui usamos o input local sem a propriedade name preenchida
      await service.register({
        email: "new@example.com",
        password: "Senha@123",
      });

      expect(mocks.generateUsername).toHaveBeenCalledWith(
        "new",
        expect.anything(),
      );
    });

    it("lança erro de validação para email inválido (Zod)", async () => {
      await expect(
        service.register({ email: "nao-e-email", password: "Senha@123" }),
      ).rejects.toThrow();
    });

    it("lança erro de validação para senha vazia (Zod)", async () => {
      await expect(
        service.register({ email: "ok@example.com", password: "" }),
      ).rejects.toThrow();
    });

    it.each([
      ["nome", { name: "a".repeat(101) }],
      ["email", { email: `${"a".repeat(250)}@x.com` }],
      ["telefone", { phone: "1".repeat(16) }],
      ["senha", { password: "a".repeat(129) }],
      ["CPF", { cpf: "1".repeat(12) }],
    ])("rejeita %s acima do limite permitido", async (_field, override) => {
      await expect(
        service.register({ ...registerInput, ...override }),
      ).rejects.toThrow();
    });

    it("session contém userId e role", async () => {
      const { session } = await service.register(registerInput);

      expect(session).toEqual({ userId: "uuid-user-1", role: "user" });
    });

    it("dispara e-mail de boas-vindas com email + nome no sucesso (EMAIL-06)", async () => {
      await service.register(registerInput);

      expect(mocks.sendWelcome).toHaveBeenCalledWith({
        email: registerInput.email,
        name: registerInput.name,
      });
    });

    it("conclui o registro mesmo se o envio de boas-vindas falhar (EMAIL-08)", async () => {
      mocks.sendWelcome.mockRejectedValue(new Error("fila indisponível"));

      const result = await service.register(registerInput);

      expect(result.user).toMatchObject({ email: mockUser.email });
      expect(result.session).toEqual({ userId: mockUser.id, role: "user" });
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe("login", () => {
    it("retorna user + session com credenciais corretas", async () => {
      mocks.credentialsFindFirst.mockResolvedValue(mockCredential);
      mocks.usersFindFirst.mockResolvedValue(mockUser);

      const result = await service.login(loginInput);

      expect(result.user).toMatchObject(mockUser);
      expect(result.user).toHaveProperty("technologyExperiences");
      expect(result.session).toEqual({ userId: mockUser.id, role: "user" });
    });

    it("lança UNAUTHORIZED quando credential não existe", async () => {
      await expect(service.login(loginInput)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Credenciais inválidas",
      });

      expect(mocks.verify).not.toHaveBeenCalled();
    });

    it("lança UNAUTHORIZED quando senha está errada", async () => {
      mocks.credentialsFindFirst.mockResolvedValue(mockCredential);
      mocks.verify.mockResolvedValue(false);

      await expect(service.login(loginInput)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Credenciais inválidas",
      });
    });

    it("lança NOT_FOUND quando user sumiu do banco", async () => {
      mocks.credentialsFindFirst.mockResolvedValue(mockCredential);
      mocks.usersFindFirst.mockResolvedValue(null);

      await expect(service.login(loginInput)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Usuário não encontrado",
      });
    });

    it("chama argon2.verify com o hash correto", async () => {
      mocks.credentialsFindFirst.mockResolvedValue(mockCredential);
      mocks.usersFindFirst.mockResolvedValue(mockUser);

      await service.login(loginInput);

      expect(mocks.verify).toHaveBeenCalledWith(
        mockCredential.passwordHash,
        loginInput.password,
      );
    });

    it("lança erro de validação para email inválido (Zod)", async () => {
      await expect(
        service.login({ email: "invalido", password: "Senha@123" }),
      ).rejects.toThrow();
    });
  });
});
