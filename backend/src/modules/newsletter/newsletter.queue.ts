import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { getConfig } from "../../config";

/**
 * Nome da fila BullMQ da newsletter. Dois tipos de job compartilham a fila:
 * `trigger` (fan-out semanal) e `send-user` (envio por usuário).
 */
export const NEWSLETTER_QUEUE_NAME = "newsletter";

const TRIGGER_JOB_NAME = "trigger";
const SEND_USER_JOB_NAME = "send-user";

/**
 * jobId fixo do repeatable job semanal — junto com o mesmo `repeat` (pattern
 * + tz) em toda chamada, garante que `scheduleWeeklyTrigger()` seja
 * idempotente (BullMQ dedupa repeatable jobs pela combinação nome+repeat).
 */
const WEEKLY_TRIGGER_JOB_ID = "newsletter-weekly-trigger";

/** Mesmo attempts/backoff exponencial usado por `email.queue.ts`. */
const QUEUE_ATTEMPTS = 3;
const QUEUE_BACKOFF = { type: "exponential" as const, delay: 2000 };

export interface NewsletterTriggerJobData {
  type: "trigger";
}

export interface NewsletterSendUserJobData {
  type: "send-user";
  userId: string;
  isoWeek: string;
}

export type NewsletterJobData =
  | NewsletterTriggerJobData
  | NewsletterSendUserJobData;

let _connection: Redis | null = null;
let _queue: Queue<NewsletterJobData> | null = null;

/**
 * Conexão ioredis dedicada ao BullMQ, separada do node-redis do cache.
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ.
 */
export function getNewsletterConnection(): Redis {
  if (_connection) return _connection;

  const { valkeyUrl } = getConfig();
  _connection = new IORedis(valkeyUrl, { maxRetriesPerRequest: null });
  return _connection;
}

/**
 * Singleton lazy da fila `newsletter` sobre Valkey (via ioredis).
 */
export function getNewsletterQueue(): Queue<NewsletterJobData> {
  if (_queue) return _queue;

  _queue = new Queue<NewsletterJobData>(NEWSLETTER_QUEUE_NAME, {
    connection: getNewsletterConnection(),
  });
  return _queue;
}

/** Tempo máximo de espera pelo registro do repeatable job no boot. */
const SCHEDULE_TIMEOUT_MS = 5000;

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Registra o repeatable job semanal (toda segunda 08:00 America/Sao_Paulo).
 * Chamado 1x no boot; BullMQ dedupa por nome+repeat, então chamar de novo
 * (ex.: em cada deploy) não duplica o agendamento (NEWSL-01).
 *
 * SPEC_DEVIATION: usa uma conexão própria e efêmera (não a conexão de longa
 * duração compartilhada com o worker) e limita a espera a
 * `SCHEDULE_TIMEOUT_MS`, sempre encerrando a conexão ao final (sucesso,
 * falha ou timeout). Reason: com a conexão singleton, um Valkey indisponível
 * no boot deixava a chamada presa retentando indefinidamente em segundo
 * plano (retry padrão do ioredis) — reusar essa mesma conexão presa no
 * worker logo em seguida derrubaria também o processamento de jobs. Efeito
 * observado no boot wiring (T12): boot nunca pode bloquear/travar por causa
 * da newsletter, mesmo princípio de AD-002.
 */
export async function scheduleWeeklyTrigger(): Promise<void> {
  const { valkeyUrl } = getConfig();
  const connection = new IORedis(valkeyUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<NewsletterJobData>(NEWSLETTER_QUEUE_NAME, {
    connection,
  });

  try {
    await Promise.race([
      queue.add(
        TRIGGER_JOB_NAME,
        { type: "trigger" },
        {
          repeat: { pattern: "0 8 * * 1", tz: "America/Sao_Paulo" },
          jobId: WEEKLY_TRIGGER_JOB_ID,
        },
      ),
      timeoutAfter(SCHEDULE_TIMEOUT_MS, "Timeout ao agendar newsletter semanal"),
    ]);
  } finally {
    void Promise.resolve(queue.close()).catch(() => {});
    void Promise.resolve(connection.quit()).catch(() => {});
  }
}

/**
 * Enfileira o job filho de envio pra um usuário, com retry/backoff
 * exponencial (mesmo padrão de `enqueueEmail`).
 */
export async function enqueueUserSend(
  userId: string,
  isoWeek: string,
): Promise<void> {
  await getNewsletterQueue().add(
    SEND_USER_JOB_NAME,
    { type: "send-user", userId, isoWeek },
    {
      attempts: QUEUE_ATTEMPTS,
      backoff: QUEUE_BACKOFF,
    },
  );
}

/**
 * Fecha a fila e a conexão no graceful shutdown.
 */
export async function closeNewsletterQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
