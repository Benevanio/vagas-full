import cors from "cors";
import { logWarn } from "../logger";

const PROD_ALLOWED_ORIGINS = [
  "https://candidate.app.br",
  "https://admin.candidate.app.br",
  "https://support.candidate.app.br",
  "https://api.candidate.app.br",
];

const DEV_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
];

/**
 * Origens permitidas. `CORS_ALLOWED_ORIGINS` (lista separada por vírgula) é a
 * fonte da verdade. Sem a env:
 * - em `production`: cai só nas origens de produção e loga um aviso — o
 *   `localhost` nunca entra no allowlist de produção por fallback silencioso;
 * - fora de produção: prod + `localhost` (dev e admin locais).
 */
function parseAllowedOrigins(value: string | undefined): Set<string> {
  const configured = String(value ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length > 0) return new Set(configured);

  if (process.env.NODE_ENV === "production") {
    logWarn(
      "CORS_ALLOWED_ORIGINS não definida em produção; usando apenas as origens de produção padrão.",
    );
    return new Set(PROD_ALLOWED_ORIGINS);
  }

  return new Set([...PROD_ALLOWED_ORIGINS, ...DEV_ALLOWED_ORIGINS]);
}

export const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS,
    );
    if (allowedOrigins.has(origin)) return callback(null, true);

    callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
};
