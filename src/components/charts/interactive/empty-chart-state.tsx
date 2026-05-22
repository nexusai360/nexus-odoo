"use client";

import type { LucideIcon } from "lucide-react";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyChartStateProps {
  message?: string;
  /** Sub-texto auxiliar opcional (ex.: "Tente ajustar os filtros."). */
  hint?: string;
  icon?: LucideIcon;
  height?: number | string;
  className?: string;
}

/**
 * Empty state padrão para charts.
 *
 * Substitui charts vazios por um placeholder explicativo, evitando o
 * anti-pattern de mostrar eixos/legenda sem dados.
 *
 * Cumpre `empty-data-state` (Charts & Data) — mensagem clara + ícone semântico,
 * com altura preservada para evitar layout shift.
 */
export function EmptyChartState({
  message = "Sem dados para exibir",
  hint,
  icon: Icon = BarChart3,
  height = 300,
  className,
}: EmptyChartStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 text-muted-foreground",
        className,
      )}
      style={{ height }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground/80">{message}</p>
        {hint ? <p className="text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}
