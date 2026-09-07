import type { ReportsKpis } from "../../infrastructure/reportsApi";

interface ReportsSummaryProps {
  data: ReportsKpis;
}

export function ReportsSummary({ data }: ReportsSummaryProps) {
  const total = data.weeklyApplications.reduce((sum, week) => sum + week.count, 0);

  const busiestWeek = data.weeklyApplications.reduce<
    ReportsKpis["weeklyApplications"][number] | null
  >((best, week) => (!best || week.count > best.count ? week : best), null);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryTile label="Candidaturas no período" value={String(total)} />
      <SummaryTile
        label="Taxa de entrevista"
        value={`${data.interviewRate.value}%`}
      />
      <SummaryTile
        label="Semana mais ativa"
        value={busiestWeek ? busiestWeek.week : "—"}
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-6 shadow-sm">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
        {label}
      </span>
      <p className="mt-2 text-[26px] font-bold leading-none text-foreground">
        {value}
      </p>
    </div>
  );
}
