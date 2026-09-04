import { type Job, Worker } from "bullmq";
import { logError, logInfo } from "../../logger";
import {
  getNewsletterConnection,
  NEWSLETTER_QUEUE_NAME,
  type NewsletterJobData,
} from "./newsletter.queue";
import { runWeeklyTrigger, sendForUser } from "./newsletter.service";

let _worker: Worker<NewsletterJobData> | null = null;

/**
 * Despacha o job pelo `type`: `trigger` roda o fan-out semanal,
 * `send-user` processa o envio de um usuário. Erro é propagado para o
 * BullMQ re-tentar (mesmo padrão de `email.worker.ts`).
 */
async function processNewsletterJob(
  job: Job<NewsletterJobData>,
): Promise<void> {
  const { data } = job;

  if (data.type === "trigger") {
    await runWeeklyTrigger();
    return;
  }

  await sendForUser(data.userId, data.isoWeek);
}

/**
 * Cria o worker in-process que consome a fila `newsletter`. Chamado no boot.
 */
export function startNewsletterWorker(): Worker<NewsletterJobData> {
  if (_worker) return _worker;

  _worker = new Worker<NewsletterJobData>(
    NEWSLETTER_QUEUE_NAME,
    processNewsletterJob,
    { connection: getNewsletterConnection() },
  );

  // Fracasso final após esgotar os retries: apenas loga (NEWSL-09).
  _worker.on("failed", (job, err) => {
    logError("Falha no processamento da newsletter após retries.", {
      jobId: job?.id,
      type: job?.data?.type,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logInfo("Newsletter worker iniciado.");
  return _worker;
}

/**
 * Fecha o worker no graceful shutdown.
 */
export async function stopNewsletterWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
