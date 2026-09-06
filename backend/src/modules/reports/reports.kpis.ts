import { JobStatus } from "../../db/schema/savedJobs";

export interface KpiSavedJob {
  id: string;
  status: JobStatus;
  appliedAt: Date | null;
  createdAt: Date;
}

export interface KpiEvent {
  savedJobId: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  createdAt: Date;
  id: string;
}

export interface KpiInput {
  savedJobs: KpiSavedJob[];
  events: KpiEvent[];
  from: Date;
  to: Date;
}

export interface KpiWeeklyApplication {
  week: string;
  weekStart: string;
  count: number;
}

export interface KpiReport {
  range: { from: string; to: string };
  weeklyApplications: KpiWeeklyApplication[];
  interviewRate: { value: number; insufficientData: boolean };
  stageDurations: {
    savedToApplied: number | null;
    appliedToInterviewing: number | null;
    interviewingToOutcome: number | null;
  };
}

const DAY_MS = 86_400_000;

/** Segunda-feira 00:00:00.000 UTC da semana ISO que contém `d`. */
function startOfIsoWeekUTC(d: Date): Date {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay(); // 0=domingo … 6=sábado
  const delta = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date;
}

/** `"YYYY-MM-DD"` da segunda-feira (UTC) da semana ISO de `d`. */
export function isoWeekStart(d: Date): string {
  return startOfIsoWeekUTC(d).toISOString().slice(0, 10);
}

/** Rótulo ISO-8601 `"YYYY-Www"` (semana 1 = a da 1ª quinta-feira, segunda = início). */
export function isoWeekLabel(d: Date): string {
  const weekStart = startOfIsoWeekUTC(d);
  const thursday = new Date(weekStart);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstWeekStart = startOfIsoWeekUTC(new Date(Date.UTC(isoYear, 0, 4)));
  const week =
    Math.floor((thursday.getTime() - firstWeekStart.getTime()) / (7 * DAY_MS)) +
    1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function diffDays(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / DAY_MS;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

export function computeKpis(input: KpiInput): KpiReport {
  const { savedJobs, events, from, to } = input;

  // 1. Index de eventos por vaga, cada lista ordenada por (createdAt asc, id asc).
  const eventsByJob = new Map<string, KpiEvent[]>();
  for (const event of events) {
    const list = eventsByJob.get(event.savedJobId);
    if (list) list.push(event);
    else eventsByJob.set(event.savedJobId, [event]);
  }
  for (const list of eventsByJob.values()) {
    list.sort((a, b) => {
      const byTime = a.createdAt.getTime() - b.createdAt.getTime();
      if (byTime !== 0) return byTime;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const inWindow = (d: Date): boolean => {
    const t = d.getTime();
    return t >= fromMs && t <= toMs;
  };

  // 2. Momento de submissão por vaga.
  const submittedAt = (job: KpiSavedJob): Date | null => {
    const jobEvents = eventsByJob.get(job.id) ?? [];
    const fromSaved = jobEvents.find((e) => e.fromStatus === "saved");
    if (fromSaved) return fromSaved.createdAt;
    if (job.status !== "saved") return job.appliedAt ?? job.createdAt;
    return null;
  };

  // 3. weeklyApplications — só semanas com ≥1 candidatura, ordenadas por weekStart.
  const submitted: Array<{ job: KpiSavedJob; at: Date }> = [];
  for (const job of savedJobs) {
    const at = submittedAt(job);
    if (at !== null && inWindow(at)) submitted.push({ job, at });
  }

  const weekMap = new Map<string, KpiWeeklyApplication>();
  for (const { at } of submitted) {
    const weekStart = isoWeekStart(at);
    const entry = weekMap.get(weekStart);
    if (entry) entry.count += 1;
    else weekMap.set(weekStart, { week: isoWeekLabel(at), weekStart, count: 1 });
  }
  const weeklyApplications = [...weekMap.values()].sort((a, b) =>
    a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0,
  );

  // 4. interviewRate.
  const denom = submitted.length;
  const reachedInterviewing = (job: KpiSavedJob): boolean => {
    const jobEvents = eventsByJob.get(job.id) ?? [];
    return (
      jobEvents.some((e) => e.toStatus === "interviewing") ||
      job.status === "interviewing"
    );
  };
  const numer = submitted.filter(({ job }) => reachedInterviewing(job)).length;
  const interviewRate =
    denom === 0
      ? { value: 0, insufficientData: true }
      : { value: Math.round((numer / denom) * 100), insufficientData: false };

  // 5. stageDurations — só transições com evento de saída dentro da janela.
  const savedToApplied: number[] = [];
  const appliedToInterviewing: number[] = [];
  const interviewingToOutcome: number[] = [];

  for (const job of savedJobs) {
    const jobEvents = eventsByJob.get(job.id) ?? [];
    let enteredAt = job.createdAt;
    for (const event of jobEvents) {
      if (inWindow(event.createdAt)) {
        const duration = diffDays(event.createdAt, enteredAt);
        if (event.fromStatus === "saved" && event.toStatus === "applied") {
          savedToApplied.push(duration);
        } else if (
          event.fromStatus === "applied" &&
          event.toStatus === "interviewing"
        ) {
          appliedToInterviewing.push(duration);
        } else if (
          event.fromStatus === "interviewing" &&
          (event.toStatus === "rejected" || event.toStatus === "accepted")
        ) {
          interviewingToOutcome.push(duration);
        }
      }
      enteredAt = event.createdAt;
    }
  }

  return {
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    weeklyApplications,
    interviewRate,
    stageDurations: {
      savedToApplied: mean(savedToApplied),
      appliedToInterviewing: mean(appliedToInterviewing),
      interviewingToOutcome: mean(interviewingToOutcome),
    },
  };
}
