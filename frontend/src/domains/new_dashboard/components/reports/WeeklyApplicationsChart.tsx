import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tokens } from "../../constants/tokens";
import type { ReportsKpis } from "../../infrastructure/reportsApi";

interface WeeklyApplicationsChartProps {
  data: ReportsKpis["weeklyApplications"];
}

export function WeeklyApplicationsChart({ data }: WeeklyApplicationsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Sem dados no período.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [value, "Candidaturas"]}
          labelFormatter={(label: string) => `Semana ${label}`}
        />
        <Bar
          dataKey="count"
          name="Candidaturas"
          fill={tokens.brand.green}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
