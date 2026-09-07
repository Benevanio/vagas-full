import { useReportsKpis } from "../../hooks/useReportsKpis";
import { InterviewRateChart } from "./InterviewRateChart";
import { PeriodSelector } from "./PeriodSelector";
import { ReportsSummary } from "./ReportsSummary";
import { StageDurationsChart } from "./StageDurationsChart";
import { WeeklyApplicationsChart } from "./WeeklyApplicationsChart";

export function ReportsTab() {
  const { data, isLoading, error, period, setPeriod, reload } = useReportsKpis();

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-6 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe sua evolução na busca por vagas.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando relatórios...</p>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !error && data ? (
        <>
          <ReportsSummary data={data} />

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-bold">Candidaturas por semana</h2>
              <div className="mt-5">
                <WeeklyApplicationsChart data={data.weeklyApplications} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-bold">Taxa de entrevista</h2>
              <div className="mt-5">
                <InterviewRateChart rate={data.interviewRate} />
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-bold">Tempo médio por etapa</h2>
            <div className="mt-5">
              <StageDurationsChart durations={data.stageDurations} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default ReportsTab;
