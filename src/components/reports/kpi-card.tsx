import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiDeltaDirection = "up" | "down" | "flat";

export interface KpiDelta {
  /** Percentual absoluto (ex: 12.5 significa 12,5%). */
  percent: number;
  direction: KpiDeltaDirection;
  /** Texto auxiliar (ex: "vs ontem", "vs período anterior"). */
  period?: string;
}

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  /**
   * Slot opcional de 2ª linha textual (ex.: conversão de moeda "≈ 2,30 USD").
   * Renderizado abaixo do hint (ou do valor, se hint ausente) com peso visual
   * menor que o hint (text-xs vs text-xs muted-foreground; mt-0.5 separação).
   */
  subtitle?: ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
  delta?: KpiDelta;
}

const toneIconColor: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-violet-400",
  danger: "text-red-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
};

const toneBgColor: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-violet-600/10",
  danger: "bg-red-500/10",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
};

const deltaTextColor: Record<KpiDeltaDirection, string> = {
  up: "text-emerald-400",
  down: "text-red-400",
  flat: "text-muted-foreground",
};

const deltaIcon: Record<KpiDeltaDirection, LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

function formatDelta(delta: KpiDelta): string {
  const sign =
    delta.direction === "up" ? "+" : delta.direction === "down" ? "-" : "";
  const value = `${sign}${percentFormatter.format(delta.percent)}%`;
  return delta.period ? `${value} ${delta.period}` : value;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  subtitle,
  tone = "default",
  delta,
}: KpiCardProps) {
  const DeltaIcon = delta ? deltaIcon[delta.direction] : null;
  return (
    <div className="group relative min-h-[128px] rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20">
      {/* Icone fica em posicao absoluta no canto, fora do fluxo, para o valor
          ocupar 100% da largura do card sem ser empurrado pelo icone. */}
      <div
        className={cn(
          "absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-lg",
          toneBgColor[tone],
        )}
      >
        <Icon className={cn("h-5 w-5", toneIconColor[tone])} />
      </div>
      <div className="min-w-0">
        {/* O label reserva espaco lateral so para o icone (pr-12). */}
        <div className="pr-12">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        </div>
        <div className="mt-3 text-[1.75rem] font-bold leading-tight tracking-tight">
          {value}
        </div>
        {delta && DeltaIcon ? (
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-medium",
              deltaTextColor[delta.direction],
            )}
          >
            <DeltaIcon className="h-3.5 w-3.5" />
            <span>{formatDelta(delta)}</span>
          </p>
        ) : null}
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
        {subtitle ? (
          <p
            data-slot="kpi-subtitle"
            className="mt-0.5 text-xs text-muted-foreground/80"
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
