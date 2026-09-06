import type { ReportsKpis } from "../../infrastructure/reportsApi";

type StageKey = keyof ReportsKpis["stageDurations"];

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: "savedToApplied", label: "Vaga salva → Candidatura" },
  { key: "appliedToInterviewing", label: "Candidatura → Entrevista" },
  { key: "interviewingToOutcome", label: "Entrevista → Desfecho" },
];

interface StageDurationsChartProps {
  durations: ReportsKpis["stageDurations"];
}

function formatDays(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} d`;
}

/**
 * Barras horizontais construídas em CSS (mesmo padrão do funil de
 * "Análise de Vagas" em DashboardTab), não Recharts: aqui precisamos
 * distinguir `null` (sem transição concluída → "—", sem barra) de `0`
 * (duração real de zero dias → barra de 0px + rótulo "0,0 d"), e um
 * `<Bar>` do Recharts trata os dois casos da mesma forma.
 */
export function StageDurationsChart({ durations }: StageDurationsChartProps) {
  const knownValues = STAGES.map((stage) => durations[stage.key]).filter(
    (value): value is number => value !== null,
  );
  const max = knownValues.length > 0 ? Math.max(...knownValues, 0.1) : 1;

  return (
    <div className="space-y-4">
      {STAGES.map((stage) => {
        const value = durations[stage.key];
        const percent =
          value === null ? 0 : Math.min(100, Math.round((value / max) * 100));

        return (
          <div key={stage.key}>
            <div className="mb-1.5 flex justify-between text-xs font-bold">
              <span>{stage.label}</span>
              <span>{value === null ? "—" : formatDays(value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border border-border bg-muted">
              {value !== null ? (
                <div
                  data-testid={`stage-bar-${stage.key}`}
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
