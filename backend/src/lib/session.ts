import type { SessionOptions } from "iron-session";

const isProd = process.env.NODE_ENV === "production";
const configuredSessionTtlSeconds = Number.parseInt(
  process.env.SESSION_TTL_SECONDS ?? String(60 * 60 * 24 * 30),
  10,
);
export const sessionTtlSeconds =
  Number.isFinite(configuredSessionTtlSeconds) && configuredSessionTtlSeconds > 60
    ? configuredSessionTtlSeconds
    : 60 * 60 * 24 * 30;

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "vagas_session",
  ttl: sessionTtlSeconds,

  cookieOptions: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    maxAge: sessionTtlSeconds - 60,
  },
};
