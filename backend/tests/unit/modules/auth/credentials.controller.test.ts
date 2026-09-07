import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../src/lib/errors";
import { CredentialsController } from "../../../../src/modules/auth/credentials.controller";

describe("CredentialsController", () => {
  let serviceMock: any;
  let controller: CredentialsController;
  let reqMock: any;
  let resMock: Partial<Response>;
  let sessionsMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    serviceMock = {
      register: vi.fn().mockResolvedValue({
        user: { id: "user_123", email: "dev@teste.com" },
        session: { userId: "user_123", role: "user" },
      }),
      login: vi.fn().mockResolvedValue({
        user: { id: "user_123", email: "dev@teste.com" },
        session: { userId: "user_123", role: "user" },
      }),
      findById: vi.fn().mockResolvedValue({
        id: "user_789",
        email: "auth@teste.com",
        displayName: "Teste",
      }),
    };

    sessionsMock = {
      create: vi.fn().mockResolvedValue({ id: "session_123" }),
      revoke: vi.fn().mockResolvedValue(true),
    };
    controller = new CredentialsController(serviceMock, sessionsMock);

    reqMock = {
      body: {},
      session: {
        userId: undefined,
        role: undefined,
        sessionId: undefined,
        save: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      },
    };

    resMock = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe("register", () => {
    it("deve registrar um usuário com sucesso, salvar a sessão e retornar 201", async () => {
      reqMock.body = { email: "novo@teste.com", password: "password123" };

      await controller.register(
        reqMock as unknown as Request,
        resMock as Response,
      );

      expect(serviceMock.register).toHaveBeenCalledWith(reqMock.body);
      expect(reqMock.session.userId).toBe("user_123");
      expect(reqMock.session.role).toBe("user");
      expect(reqMock.session.save).toHaveBeenCalled();
      expect(resMock.status).toHaveBeenCalledWith(201);
    });

    it("deve lançar CONFLICT se o email já estiver cadastrado", async () => {
      reqMock.body = { email: "existente@teste.com", password: "password123" };
      serviceMock.register.mockRejectedValue(
        AppError.conflict("Email já cadastrado"),
      );

      await expect(
        controller.register(reqMock as unknown as Request, resMock as Response),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        statusCode: 409,
        message: "Email já cadastrado",
      });
    });
  });

  describe("login", () => {
    it("deve logar com sucesso, atualizar o userId na sessão e retornar dados do usuário", async () => {
      reqMock.body = { email: "dev@teste.com", password: "password123" };

      await controller.login(
        reqMock as unknown as Request,
        resMock as Response,
      );

      expect(resMock.json).toHaveBeenCalledWith({
        user: { id: "user_123", email: "dev@teste.com" },
        session: { userId: "user_123", role: "user" },
      });
      expect(reqMock.session.userId).toBe("user_123");
      expect(reqMock.session.role).toBe("user");
      expect(reqMock.session.save).toHaveBeenCalled();
    });

    it("deve lançar UNAUTHORIZED se as credenciais forem inválidas", async () => {
      reqMock.body = { email: "errado@teste.com", password: "password123" };
      serviceMock.login.mockRejectedValue(
        AppError.unauthorized("Credenciais inválidas"),
      );

      await expect(
        controller.login(reqMock as unknown as Request, resMock as Response),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        statusCode: 401,
        message: "Credenciais inválidas",
      });
    });
  });

  describe("logout", () => {
    it("deve destruir a sessão corrente e retornar ok", async () => {
      await controller.logout(
        reqMock as unknown as Request,
        resMock as Response,
      );
      expect(reqMock.session.destroy).toHaveBeenCalled();
      expect(resMock.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("me", () => {
    it("deve retornar o user completo se o usuário estiver autenticado na sessão", async () => {
      reqMock.session.userId = "user_789";

      await controller.me(reqMock as unknown as Request, resMock as Response);

      expect(serviceMock.findById).toHaveBeenCalledWith("user_789");
      expect(resMock.json).toHaveBeenCalledWith({
        user: { id: "user_789", email: "auth@teste.com", displayName: "Teste" },
      });
    });

    it("deve lançar UNAUTHORIZED se findById não encontrar o usuário", async () => {
      reqMock.session.userId = "user_inexistente";
      serviceMock.findById.mockResolvedValue(null);

      await expect(
        controller.me(reqMock as unknown as Request, resMock as Response),
      ).rejects.toBeInstanceOf(AppError);

      expect(reqMock.session.destroy).toHaveBeenCalled();
    });

    it("deve lançar UNAUTHORIZED se não houver userId na sessão", async () => {
      reqMock.session.userId = undefined;

      await expect(
        controller.me(reqMock as unknown as Request, resMock as Response),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
    });
  });
});
