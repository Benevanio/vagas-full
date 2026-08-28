import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  setContext: vi.fn(),
  withScope: vi.fn((callback) => callback({ setContext: mocks.setContext })),
}));

vi.mock("@sentry/node", () => ({
  captureException: mocks.captureException,
  init: mocks.init,
  withScope: mocks.withScope,
}));

describe("error tracking", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("fica desativado sem SENTRY_DSN", async () => {
    const tracking = await import("../../src/errorTracking");

    expect(tracking.initErrorTracking()).toBe(false);
    tracking.captureException(new Error("falha"), {});

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("envia exceções ao Sentry quando configurado", async () => {
    process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    process.env.NODE_ENV = "production";
    const tracking = await import("../../src/errorTracking");
    const error = new Error("falha");

    expect(tracking.initErrorTracking()).toBe(true);
    tracking.captureException(error, { requestId: "request-123" });

    expect(mocks.init).toHaveBeenCalledWith({
      dsn: process.env.SENTRY_DSN,
      environment: "production",
      sendDefaultPii: false,
    });
    expect(mocks.setContext).toHaveBeenCalledWith("request", {
      requestId: "request-123",
    });
    expect(mocks.captureException).toHaveBeenCalledWith(error);
  });
});
