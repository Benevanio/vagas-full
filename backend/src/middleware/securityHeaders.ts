import { NextFunction, Request, Response } from "express";

export const apiContentSecurityPolicy =
  "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";

export const swaggerContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";

export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentSecurityPolicy = req.path.startsWith("/docs")
    ? swaggerContentSecurityPolicy
    : apiContentSecurityPolicy;

  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
}
