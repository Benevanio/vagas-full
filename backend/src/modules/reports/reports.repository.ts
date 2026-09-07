import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { applicationEvents, savedJobs } from "../../db/schema";
import { KpiEvent, KpiSavedJob } from "./reports.kpis";

export interface UserActivity {
  savedJobs: KpiSavedJob[];
  events: KpiEvent[];
}

export class ReportsRepository {
  /**
   * Busca toda a atividade do usuário (vagas salvas + trilha de eventos)
   * necessária para o cálculo de KPIs. Sem recorte por janela aqui — o
   * núcleo (`computeKpis`) precisa do evento imediatamente anterior a `from`
   * para calcular durações de etapa corretamente.
   */
  async fetchUserActivity(userId: string): Promise<UserActivity> {
    const jobRows = await db
      .select({
        id: savedJobs.id,
        status: savedJobs.status,
        appliedAt: savedJobs.appliedAt,
        createdAt: savedJobs.createdAt,
      })
      .from(savedJobs)
      .where(eq(savedJobs.userId, userId));

    const eventRows = await db
      .select({
        id: applicationEvents.id,
        savedJobId: applicationEvents.savedJobId,
        fromStatus: applicationEvents.fromStatus,
        toStatus: applicationEvents.toStatus,
        createdAt: applicationEvents.createdAt,
      })
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId))
      .orderBy(asc(applicationEvents.createdAt), asc(applicationEvents.id));

    return { savedJobs: jobRows, events: eventRows };
  }
}
