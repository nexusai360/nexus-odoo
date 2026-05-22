"use client";

import { cn } from "@/lib/utils";

export interface ChartTooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  formatValue?: (v: number) => string;
  /** Texto auxiliar opcional renderizado abaixo dos valores (ex.: "Total: 100"). */
  footer?: string;
  className?: string;
}

const defaultFormatter = (v: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR") : "—";

/**
 * Tooltip rico e consistente para todos os charts da library.
 *
 * Princípios:
 * - bg-card + border-border + shadow-lg (alinha com cards do design system);
 * - dot colorido + label semântico + valor em negrito;
 * - aceita formatador para % / R$ / etc.;
 * - mantém contraste >= 4.5:1 (texto foreground em bg-card).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = defaultFormatter,
  footer,
  className,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      role="tooltip"
      className={cn(
        "min-w-[140px] rounded-lg border border-border bg-card p-3 shadow-lg",
        className,
      )}
    >
      {label !== undefined && label !== "" ? (
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {String(label)}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {payload.map((entry, i) => {
          const numericValue =
            typeof entry.value === "number"
              ? entry.value
              : Number(entry.value ?? 0);
          return (
            <li
              key={`${String(entry.dataKey ?? entry.name ?? i)}-${i}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color ?? "currentColor" }}
              />
              <span className="text-foreground/80">
                {String(entry.name ?? entry.dataKey ?? "")}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {formatValue(numericValue)}
              </span>
            </li>
          );
        })}
      </ul>
      {footer ? (
        <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </div>
  );
}
