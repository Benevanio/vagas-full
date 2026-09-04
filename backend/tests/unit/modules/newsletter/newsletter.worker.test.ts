import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  runWeeklyTrigger: vi.fn(),
  sendForUser: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  getNewsletterConnection: vi.fn(() => ({})),
}));

const loggerMocks = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// Captura o processor e os handlers registrados no Worker.
const workerState = vi.hoisted(() => ({
  processor: null as
    | ((job: { data: unknown }) => Promise<unknown>)
    | null,
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  close: vi.fn(),
  on: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    close = workerState.close;
    constructor(
      _name: string,
      processor: (job: { data: unknown }) => Promise<unknown>,
    ) {
      workerState.processor = processor;
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      workerState.handlers[event] = handler;
      workerState.on(event, handler);
      return this;
    }
  },
}));

vi.mock("../../../../src/modules/newsletter/newsletter.queue", () => ({
  NEWSLETTER_QUEUE_NAME: "newsletter",
  getNewsletterConnection: queueMocks.getNewsletterConnection,
}));

vi.mock("../../../../src/modules/newsletter/newsletter.service", () => ({
  runWeeklyTrigger: serviceMocks.runWeeklyTrigger,
  sendForUser: serviceMocks.sendForUser,
}));

vi.mock("../../../../src/logger", () => loggerMocks);

import {
  startNewsletterWorker,
  stopNewsletterWorker,
} from "../../../../src/modules/newsletter/newsletter.worker";

describe("NewsletterWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerState.processor = null;
    workerState.handlers = {};
    serviceMocks.runWeeklyTrigger.mockResolvedValue(undefined);
    serviceMocks.sendForUser.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await stopNewsletterWorker();
  });

  it("despacha job tipo 'trigger' para runWeeklyTrigger()", async () => {
    startNewsletterWorker();
    const job = { data: { type: "trigger" } };

    await workerState.processor!(job);

    expect(serviceMocks.runWeeklyTrigger).toHaveBeenCalledTimes(1);
    expect(serviceMocks.sendForUser).not.toHaveBeenCalled();
  });

  it("despacha job tipo 'send-user' para sendForUser(userId, isoWeek)", async () => {
    startNewsletterWorker();
    const job = {
      data: { type: "send-user", userId: "user-1", isoWeek: "2026-W36" },
    };

    await workerState.processor!(job);

    expect(serviceMocks.sendForUser).toHaveBeenCalledWith(
      "user-1",
      "2026-W36",
    );
    expect(serviceMocks.runWeeklyTrigger).not.toHaveBeenCalled();
  });

  it("propaga o erro pra permitir retry do BullMQ quando o processamento falha", async () => {
    serviceMocks.sendForUser.mockRejectedValue(new Error("db down"));
    startNewsletterWorker();
    const job = {
      data: { type: "send-user", userId: "user-1", isoWeek: "2026-W36" },
    };

    await expect(workerState.processor!(job)).rejects.toThrow("db down");
  });

  it("registra a falha final (após retries) via logError sem lançar, no handler 'failed'", () => {
    startNewsletterWorker();
    const failedHandler = workerState.handlers["failed"];
    expect(failedHandler).toBeDefined();

    const job = { id: "job-1", data: { type: "send-user", userId: "user-1" } };
    expect(() =>
      failedHandler(job, new Error("fracasso final")),
    ).not.toThrow();
    expect(loggerMocks.logError).toHaveBeenCalled();
  });

  it("startNewsletterWorker/stopNewsletterWorker seguem o padrão singleton (reusa a mesma instância)", () => {
    const first = startNewsletterWorker();
    const second = startNewsletterWorker();

    expect(first).toBe(second);
  });
});
