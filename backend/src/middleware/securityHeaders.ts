import { NextFunction, Request, Response } from "express";

export const apiContentSecurityPolicy =
  "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";

export const swaggerContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 *
 * A API usa uma CSP sem fontes de recursos; a documentação em `/docs` usa
 * uma política limitada aos assets locais do Swagger.
 *
 * `Strict-Transport-Security` só é enviado sobre HTTPS (atrás do proxy,
 * `req.secure` reflete `x-forwarded-proto` graças a `app.set("trust proxy", 1)`)
 * ou quando `NODE_ENV=production`, onde o tráfego é sempre HTTPS. `preload`
 * fica de fora de propósito: entrar na lista de preload é uma decisão difícil
 * de reverter e deve ser um opt-in explícito do time.
 */
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

  if (req.secure || process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
}
