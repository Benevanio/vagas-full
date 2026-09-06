import { z } from "zod";

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 90;

/** `YYYY-MM-DD` que corresponde a uma data de calendário real (rejeita "2026-02-30"). */
function isValidCalendarDate(value: string): boolean {
  if (!DATE_FORMAT.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateStringSchema = z
  .string()
  .refine(isValidCalendarDate, "Data inválida. Use o formato YYYY-MM-DD.");

function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function parseStartOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function parseEndOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

export interface ReportsKpisQuery {
  from: Date;
  to: Date;
}

/**
 * Factory determinística: `now` é injetável para teste. A instância usada em
 * produção deve ser construída por request (ver `reports.routes.ts`), nunca
 * uma única vez no módulo — senão o default de "hoje" congelaria no horário
 * em que o processo subiu.
 */
export function buildReportsKpisQuerySchema(now: Date = new Date()) {
  return z
    .object({
      from: dateStringSchema.optional(),
      to: dateStringSchema.optional(),
    })
    .transform((value) => {
      const to = value.to ? parseEndOfDay(value.to) : endOfDayUTC(now);
      const from = value.from
        ? parseStartOfDay(value.from)
        : startOfDayUTC(new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS));

      return { from, to };
    })
    .refine((range) => range.from.getTime() <= range.to.getTime(), {
      message: "O parâmetro 'from' não pode ser depois de 'to'.",
      path: ["from"],
    });
}

/** Instância de conveniência (ex.: para testes que não precisam controlar "hoje"). */
export const reportsKpisQuerySchema = buildReportsKpisQuerySchema();
