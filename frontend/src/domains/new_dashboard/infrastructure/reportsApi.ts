import { z } from "zod";
import { api } from "@/shared/lib/apiClient";

export type PeriodPreset = "30d" | "90d" | "12m" | "tudo";

export interface ReportsKpis {
  range: { from: string; to: string };
  weeklyApplications: Array<{ week: string; weekStart: string; count: number }>;
  interviewRate: { value: number; insufficientData: boolean };
  stageDurations: {
    savedToApplied: number | null;
    appliedToInterviewing: number | null;
    interviewingToOutcome: number | null;
  };
}

const ApiWeeklyApplicationSchema = z.object({
  week: z.string(),
  weekStart: z.string(),
  count: z.number(),
});

const ApiReportsKpisSchema = z
  .object({
    range: z
      .object({ from: z.string(), to: z.string() })
      .partial()
      .optional(),
    weeklyApplications: z.array(ApiWeeklyApplicationSchema).nullable().optional(),
    interviewRate: z
      .object({
        value: z.number().nullable().optional(),
        insufficientData: z.boolean().nullable().optional(),
      })
      .partial()
      .optional(),
    stageDurations: z
      .object({
        savedToApplied: z.number().nullable().optional(),
        appliedToInterviewing: z.number().nullable().optional(),
        interviewingToOutcome: z.number().nullable().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export function toReportsKpis(data: unknown): ReportsKpis {
  const parsed = ApiReportsKpisSchema.parse(data);

  return {
    range: {
      from: parsed.range?.from ?? "",
      to: parsed.range?.to ?? "",
    },
    weeklyApplications: parsed.weeklyApplications ?? [],
    interviewRate: {
      value: parsed.interviewRate?.value ?? 0,
      insufficientData: parsed.interviewRate?.insufficientData ?? true,
    },
    stageDurations: {
      savedToApplied: parsed.stageDurations?.savedToApplied ?? null,
      appliedToInterviewing: parsed.stageDurations?.appliedToInterviewing ?? null,
      interviewingToOutcome: parsed.stageDurations?.interviewingToOutcome ?? null,
    },
  };
}

/** `YYYY-MM-DD` de hoje, em UTC. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` de `days` dias atrás (a partir de hoje), em UTC. */
function daysAgoUTC(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` de `months` meses atrás (a partir de hoje), em UTC. */
function monthsAgoUTC(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Converte um preset de período em `{ from, to }` para a query do endpoint. "tudo" não envia `from`. */
export function periodToRange(preset: PeriodPreset): { from?: string; to?: string } {
  switch (preset) {
    case "30d":
      return { from: daysAgoUTC(30), to: todayUTC() };
    case "90d":
      return { from: daysAgoUTC(90), to: todayUTC() };
    case "12m":
      return { from: monthsAgoUTC(12), to: todayUTC() };
    case "tudo":
      return {};
  }
}

export async function getReportsKpis(
  params: { from?: string; to?: string } = {},
): Promise<ReportsKpis> {
  const { data } = await api.get("/reports/kpis", { params });
  return toReportsKpis(data);
}
