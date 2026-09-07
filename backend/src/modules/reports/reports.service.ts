import { computeKpis, earliestActivityDate, KpiReport } from "./reports.kpis";
import { ReportsRepository } from "./reports.repository";
import { ReportsKpisQuery } from "./schemas/reports.schemas";

/** Garante `from <= to`: sem data, ou com data depois do fim, usa o próprio `to`. */
function clampToWindow(from: Date | null, to: Date): Date {
  if (!from || from.getTime() > to.getTime()) return to;
  return from;
}

export class ReportsService {
  constructor(private readonly repo: ReportsRepository = new ReportsRepository()) {}

  async getKpis(userId: string, query: ReportsKpisQuery): Promise<KpiReport> {
    const activity = await this.repo.fetchUserActivity(userId);

    // "Tudo" (all=true) não tem `from` fixo — o histórico completo do usuário
    // começa na atividade mais antiga que ele tem. Sem nenhuma atividade (ou
    // com um `to` anterior a ela), usa `to` como `from`: janela vazia, mas com
    // `range` coerente na resposta em vez de um intervalo invertido.
    const from = query.all
      ? clampToWindow(
          earliestActivityDate(activity.savedJobs, activity.events),
          query.to,
        )
      : query.from;

    return computeKpis({
      savedJobs: activity.savedJobs,
      events: activity.events,
      from,
      to: query.to,
    });
  }
}
