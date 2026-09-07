import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { tokens } from "../../constants/tokens";
import type { ReportsKpis } from "../../infrastructure/reportsApi";

interface InterviewRateChartProps {
  rate: ReportsKpis["interviewRate"];
}

export function InterviewRateChart({ rate }: InterviewRateChartProps) {
  if (rate.insufficientData) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Sem dados no período.
      </div>
    );
  }

  const achieved = Math.max(0, Math.min(100, rate.value));
  const data = [
    { name: "Atingiu entrevista", value: achieved },
    { name: "Restante", value: 100 - achieved },
  ];

  return (
    <div className="relative h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={tokens.brand.green} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{rate.value}%</span>
        <span className="text-xs text-muted-foreground">Taxa de entrevista</span>
      </div>
    </div>
  );
}
