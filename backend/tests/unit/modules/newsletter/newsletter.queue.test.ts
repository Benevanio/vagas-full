import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const bullmqMocks = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  QueueConstructor: vi.fn(),
}));

const ioredisMocks = vi.hoisted(() => ({
  RedisConstructor: vi.fn(),
  quit: vi.fn(),
}));

vi.mock("../../../../src/config", () => ({
  getConfig: configMocks.getConfig,
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = bullmqMocks.add;
    close = bullmqMocks.close;
    constructor(name: string, opts: unknown) {
      bullmqMocks.QueueConstructor(name, opts);
    }
  },
}));

vi.mock("ioredis", () => ({
  default: class {
    quit = ioredisMocks.quit;
    constructor(url: string, opts: unknown) {
      ioredisMocks.RedisConstructor(url, opts);
    }
  },
}));

import {
  closeNewsletterQueue,
  enqueueUserSend,
  getNewsletterQueue,
  scheduleWeeklyTrigger,
} from "../../../../src/modules/newsletter/newsletter.queue";

describe("NewsletterQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.getConfig.mockReturnValue({
      valkeyUrl: "redis://localhost:6379",
    });
  });

  afterEach(async () => {
    await closeNewsletterQueue();
  });

  it("cria a conexão ioredis com maxRetriesPerRequest null", () => {
    getNewsletterQueue();

    expect(ioredisMocks.RedisConstructor).toHaveBeenCalledWith(
      "redis://localhost:6379",
      { maxRetriesPerRequest: null },
    );
  });

  it("cria a fila 'newsletter' reutilizando a mesma instância (singleton)", () => {
    const first = getNewsletterQueue();
    const second = getNewsletterQueue();

    expect(first).toBe(second);
    expect(bullmqMocks.QueueConstructor).toHaveBeenCalledTimes(1);
    expect(bullmqMocks.QueueConstructor).toHaveBeenCalledWith(
      "newsletter",
      expect.objectContaining({ connection: expect.anything() }),
    );
  });

  it("registra o repeatable job semanal com pattern, tz e jobId fixos (NEWSL-01)", async () => {
    await scheduleWeeklyTrigger();

    expect(bullmqMocks.add).toHaveBeenCalledWith(
      "trigger",
      { type: "trigger" },
      {
        repeat: { pattern: "0 8 * * 1", tz: "America/Sao_Paulo" },
        jobId: "newsletter-weekly-trigger",
      },
    );
  });

  it("chamar scheduleWeeklyTrigger duas vezes usa sempre o mesmo jobId/repeat (idempotente)", async () => {
    await scheduleWeeklyTrigger();
    await scheduleWeeklyTrigger();

    expect(bullmqMocks.add).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = bullmqMocks.add.mock.calls;
    expect(firstCall).toEqual(secondCall);
  });

  it("enfileira job filho por usuário com attempts e backoff exponencial", async () => {
    await enqueueUserSend("user-1", "2026-W36");

    expect(bullmqMocks.add).toHaveBeenCalledWith(
      "send-user",
      { type: "send-user", userId: "user-1", isoWeek: "2026-W36" },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      }),
    );
  });

  it("fecha a fila e a conexão no closeNewsletterQueue", async () => {
    getNewsletterQueue();

    await closeNewsletterQueue();

    expect(bullmqMocks.close).toHaveBeenCalled();
    expect(ioredisMocks.quit).toHaveBeenCalled();
  });
});
