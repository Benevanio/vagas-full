import { computeKpis, KpiReport } from "./reports.kpis";
import { ReportsRepository } from "./reports.repository";

export class ReportsService {
  constructor(private readonly repo: ReportsRepository = new ReportsRepository()) {}

  async getKpis(
    userId: string,
    range: { from: Date; to: Date },
  ): Promise<KpiReport> {
    const activity = await this.repo.fetchUserActivity(userId);

    return computeKpis({
      savedJobs: activity.savedJobs,
      events: activity.events,
      from: range.from,
      to: range.to,
    });
  }
}
