import { cn } from "@/shared/lib/utils";
import type { PeriodPreset } from "../../infrastructure/reportsApi";

const OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
  { value: "tudo", label: "Tudo" },
];

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Selecionar período"
      className="inline-flex gap-1 rounded-xl border border-border bg-muted p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-slate-500 hover:text-foreground dark:text-slate-300",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
