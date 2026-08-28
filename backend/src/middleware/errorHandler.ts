import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { captureException } from "../errorTracking";
import { logError } from "../logger";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error.message.startsWith("Origin not allowed by CORS")) {
    const appError = AppError.forbidden("Origem não permitida.");
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  if (error instanceof ZodError) {
    const appError = AppError.fromZodError(error);
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }

  const details = isProduction()
    ? undefined
    : { cause: error.message || "unknown" };
  logError("Erro inesperado na requisição.", {
    err: error,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl ?? req.path,
  });
  captureException(error, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  });
  const appError = AppError.internal("Erro interno.", details);
  res.status(appError.statusCode).json(appError.toJSON());
}
