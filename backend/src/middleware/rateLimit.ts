import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getCache } from "../lib/cache";
import { logger } from "../logger";

interface RateLimitConfig {
  name: string;
  max: number;
  windowSeconds: number;
  keyGenerator: (req: Request) => string | null;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function normalizedEmail(req: Request): string | null {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  return hashKey(normalized);
}

async function consumeFromMemory(
  key: string,
  windowSeconds: number,
): Promise<RateLimitEntry> {
  const now = Date.now();
  const current = memoryStore.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowSeconds * 1000 };
    memoryStore.set(key, next);
    return next;
  }

  current.count += 1;
  memoryStore.set(key, current);
  return current;
}

async function consumeFromValkey(
  key: string,
  windowSeconds: number,
): Promise<RateLimitEntry> {
  const client = await getCache();
  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, windowSeconds);
  }

  const ttl = await client.ttl(key);
  const safeTtl = ttl > 0 ? ttl : windowSeconds;

  return { count, resetAt: Date.now() + safeTtl * 1000 };
}

function setRateLimitHeaders(
  res: Response,
  max: number,
  entry: RateLimitEntry,
): void {
  const resetSeconds = Math.max(
    1,
    Math.ceil((entry.resetAt - Date.now()) / 1000),
  );

  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (entry.count > max) {
    res.setHeader("Retry-After", String(resetSeconds));
  }
}

function createRateLimiter(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const generatedKey = config.keyGenerator(req);
    if (!generatedKey) return next();

    const key = `rate-limit:${config.name}:${generatedKey}`;

    try {
      const entry = process.env.VALKEY_URL
        ? await consumeFromValkey(key, config.windowSeconds)
        : await consumeFromMemory(key, config.windowSeconds);

      setRateLimitHeaders(res, config.max, entry);

      if (entry.count > config.max) {
        return res.status(429).json({
          error: "Muitas tentativas. Tente novamente mais tarde.",
        });
      }

      return next();
    } catch (error) {
      logger.error(
        { err: error, limiter: config.name },
        "Auth rate limit failed",
      );
      return res.status(503).json({
        error: "Controle de tentativas indisponível.",
      });
    }
  };
}

const authIpMax = parsePositiveInt(process.env.AUTH_RATE_LIMIT_IP_MAX, 20);
const authAccountMax = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX,
  5,
);
const authWindowSeconds = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  15 * 60,
);

export const authIpRateLimiter = createRateLimiter({
  name: "auth:ip",
  max: authIpMax,
  windowSeconds: authWindowSeconds,
  keyGenerator: (req) => hashKey(clientIp(req)),
});

export const authAccountRateLimiter = createRateLimiter({
  name: "auth:account",
  max: authAccountMax,
  windowSeconds: authWindowSeconds,
  keyGenerator: normalizedEmail,
});

/**
 * Limita o cadastro por e-mail (bucket próprio, separado do de login) para
 * conter criação de contas em massa e enumeração de e-mails já registrados.
 * Sem e-mail no corpo o limiter é ignorado e a validação Zod trata o 400.
 */
export const authRegisterRateLimiter = createRateLimiter({
  name: "auth:register",
  max: authAccountMax,
  windowSeconds: authWindowSeconds,
  keyGenerator: normalizedEmail,
});

export function resetInMemoryRateLimitStore(): void {
  memoryStore.clear();
}
