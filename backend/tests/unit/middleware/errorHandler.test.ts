import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "../../../src/lib/errors";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../../src/logger", () => ({
  logError: mocks.logError,
}));

vi.mock("../../../src/errorTracking", () => ({
  captureException: mocks.captureException,
}));

import { errorHandler } from "../../../src/middleware/errorHandler";

function createRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, res: { status } as any };
}

describe("errorHandler", () => {
  it("registra erro inesperado com contexto da requisição", () => {
    const { res } = createRes();
    const error = new Error("falha inesperada");

    errorHandler(
      error,
      {
        requestId: "request-123",
        method: "POST",
        originalUrl: "/auth/login",
        path: "/auth/login",
      } as any,
      res,
      vi.fn(),
    );

    expect(mocks.logError).toHaveBeenCalledWith(
      "Erro inesperado na requisição.",
      expect.objectContaining({
        err: error,
        requestId: "request-123",
        method: "POST",
        path: "/auth/login",
      }),
    );
    expect(mocks.captureException).toHaveBeenCalledWith(error, {
      requestId: "request-123",
      method: "POST",
      path: "/auth/login",
    });
  });

  it("retorna FORBIDDEN para erro de CORS", () => {
    const { status, json, res } = createRes();

    errorHandler(
      new Error("Origin not allowed by CORS"),
      {} as any,
      res,
      vi.fn(),
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: "FORBIDDEN",
      message: "Origem não permitida.",
    });
  });

  it("serializa AppError com details", () => {
    const { status, json, res } = createRes();
    const error = AppError.conflict("Email já cadastrado");

    errorHandler(error, {} as any, res, vi.fn());

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: "CONFLICT",
      message: "Email já cadastrado",
    });
  });

  it("converte ZodError residual em VALIDATION_ERROR", () => {
    const { status, json, res } = createRes();
    const zodError = new z.ZodError([
      {
        code: "custom",
        path: ["email"],
        message: "Email inválido",
      },
    ]);

    errorHandler(zodError, {} as any, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: expect.objectContaining({ email: expect.any(Array) }),
      }),
    );
  });

  it("retorna INTERNAL_ERROR sem vazar cause em production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { status, json, res } = createRes();

    errorHandler(new Error("segredo interno"), {} as any, res, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: "INTERNAL_ERROR",
      message: "Erro interno.",
    });

    process.env.NODE_ENV = previous;
  });

  it("inclui cause em details fora de production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const { status, json, res } = createRes();

    errorHandler(new Error("Erro qualquer"), {} as any, res, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: "INTERNAL_ERROR",
      message: "Erro interno.",
      details: { cause: "Erro qualquer" },
    });

    process.env.NODE_ENV = previous;
  });
});
