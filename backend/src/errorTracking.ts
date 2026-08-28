import * as Sentry from "@sentry/node";

let enabled = false;

export function initErrorTracking(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
  });
  enabled = true;
  return true;
}

export function captureException(
  error: Error,
  context: { requestId?: string; method?: string; path?: string },
): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
