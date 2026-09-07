import "dotenv/config";
import { createJobsApiApp } from "./app";
import { closeCache } from "./lib/cache";
import { logError, logInfo, logWarn } from "./logger";
import { closeEmailQueue } from "./modules/email/email.queue";
import { startEmailWorker, stopEmailWorker } from "./modules/email/email.worker";
import {
  closeNewsletterQueue,
  scheduleWeeklyTrigger,
} from "./modules/newsletter/newsletter.queue";
import {
  startNewsletterWorker,
  stopNewsletterWorker,
} from "./modules/newsletter/newsletter.worker";

const PORT = Number(process.env.PORT ?? 3001);

const app = createJobsApiApp();
app.set("trust proxy", 1);

async function registerSwaggerDocs(): Promise<void> {
  try {
    const [{ default: swaggerUi }, { default: swaggerSpec }] =
      await Promise.all([import("swagger-ui-express"), import("./swagger")]);
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  } catch (error) {
    logWarn("Swagger desabilitado", {
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function startServer(): Promise<void> {
  await registerSwaggerDocs();

  // Worker in-process de e-mail: sobe junto do servidor (EMAIL-02).
  startEmailWorker();

  // Worker + agendamento semanal da newsletter: sobem junto do servidor
  // (NEWSL-01). Não aguarda o registro do repeatable job — mesmo princípio
  // do módulo de e-mail (AD-002): infra indisponível nunca bloqueia o boot.
  startNewsletterWorker();
  scheduleWeeklyTrigger().catch((error) => {
    logWarn("Falha ao agendar o job semanal da newsletter.", {
      error: error instanceof Error ? error.message : error,
    });
  });

  app.listen(PORT, () => {
    logInfo(`API rodando em http://localhost:${PORT}`);
    logInfo(`Documentação da API em http://localhost:${PORT}/docs`);
  });
}

async function shutdown(signal: string): Promise<void> {
  logInfo(`Recebido ${signal}, encerrando recursos...`);
  try {
    await stopEmailWorker();
    await closeEmailQueue();
    await stopNewsletterWorker();
    await closeNewsletterQueue();
    await closeCache();
  } catch (error) {
    logError("Erro no graceful shutdown", {
      error: error instanceof Error ? error.message : error,
    });
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void startServer();
