import { NextFunction, Request, Response } from "express";

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 *
 * `Strict-Transport-Security` só é enviado sobre HTTPS (atrás do proxy,
 * `req.secure` reflete `x-forwarded-proto` graças a `app.set("trust proxy", 1)`)
 * ou quando `NODE_ENV=production`, onde o tráfego é sempre HTTPS. `preload`
 * fica de fora de propósito: entrar na lista de preload é uma decisão difícil
 * de reverter e deve ser um opt-in explícito do time.
 *
 * CSP não é definida aqui — é tratada na PAV-132.
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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
