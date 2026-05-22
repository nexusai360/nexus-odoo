"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardPeriod = "dia" | "semana" | "mes";

interface PeriodNavigatorProps {
  period: DashboardPeriod;
  /** Range aplicado pelo backend (ISO strings UTC). */
  range: { start: string; end: string };
  tz: string;
  weekStartsOn: number;
  /** referenceDate atual (null = hoje). */
  referenceDate: string | null;
  /** Backend indica se há período seguinte (range.end < now). */
  nextAvailable: boolean;
  onChange: (referenceDate: string | null) => void;
  /** ISO string — bloqueia navegação para trás antes desta data. */
  minDate?: string;
}

const MONTH_ABBR_PT = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

function formatDayDate(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function formatMonthYear(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const yyyy = parts.find((p) => p.type === "year")?.value ?? "";
  const mm = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10);
  const yy = yyyy.slice(-2);
  return `${MONTH_ABBR_PT[mm - 1]}/${yy}`;
}

function shiftReferenceDate(
  currentReferenceISO: string | null,
  period: DashboardPeriod,
  direction: "prev" | "next",
): string {
  const ref = currentReferenceISO ? new Date(currentReferenceISO) : new Date();
  const next = new Date(ref);
  const sign = direction === "prev" ? -1 : 1;

  if (period === "dia") {
    next.setUTCDate(next.getUTCDate() + sign * 1);
  } else if (period === "semana") {
    next.setUTCDate(next.getUTCDate() + sign * 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + sign * 1);
  }
  return next.toISOString();
}

export function PeriodNavigator({
  period,
  range,
  tz,
  referenceDate,
  nextAvailable,
  onChange,
  minDate,
}: PeriodNavigatorProps) {
  const label = (() => {
    if (period === "dia") {
      return formatDayDate(range.start, tz);
    }
    if (period === "semana") {
      const inclusiveEnd = new Date(new Date(range.end).getTime() - 1).toISOString();
      return `${formatDayDate(range.start, tz)} — ${formatDayDate(inclusiveEnd, tz)}`;
    }
    return formatMonthYear(range.start, tz);
  })();

  const prevAvailable = !minDate || new Date(range.start) > new Date(minDate);

  const handlePrev = () => {
    if (!prevAvailable) return;
    onChange(shiftReferenceDate(referenceDate, period, "prev"));
  };
  const handleNext = () => {
    if (!nextAvailable) return;
    onChange(shiftReferenceDate(referenceDate, period, "next"));
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border bg-violet-500/5 px-2 py-1.5",
        "border-violet-500/30 transition-all duration-150",
        "hover:border-violet-500/50 hover:bg-violet-500/10",
      )}
      role="group"
      aria-label={`Navegação de ${period}`}
    >
      <button
        type="button"
        onClick={handlePrev}
        disabled={!prevAvailable}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
          prevAvailable
            ? "text-violet-600 dark:text-violet-300 hover:bg-violet-500/15 hover:text-violet-800 dark:hover:bg-violet-500/25 dark:hover:text-violet-100 cursor-pointer focus-visible:outline-none focus-visible:bg-violet-500/20"
            : "text-violet-400/40 dark:text-violet-300/30 cursor-not-allowed",
        )}
        aria-label="Período anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="px-2 text-sm font-medium tabular-nums text-violet-700 dark:text-violet-100 select-none whitespace-nowrap leading-none">
        {label}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!nextAvailable}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
          nextAvailable
            ? "text-violet-600 dark:text-violet-300 hover:bg-violet-500/15 hover:text-violet-800 dark:hover:bg-violet-500/25 dark:hover:text-violet-100 cursor-pointer focus-visible:outline-none focus-visible:bg-violet-500/20"
            : "text-violet-400/40 dark:text-violet-300/30 cursor-not-allowed",
        )}
        aria-label="Próximo período"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
