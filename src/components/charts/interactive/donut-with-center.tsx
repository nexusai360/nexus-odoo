"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { type ChartTooltipPayloadItem } from "./chart-tooltip";
import { EmptyChartState } from "./empty-chart-state";
import { CHART_PALETTE, getColorByIndex } from "@/components/charts/colors";
import { cn } from "@/lib/utils";

/**
 * Forma de dado de uma fatia do donut. Declarada localmente — no nexus-insights
 * vinha de `charts/pie-chart`; aqui o donut interativo é auto-contido para não
 * colidir com o `pie-chart.tsx` que o nexus-odoo já tem (F3.5).
 */
export interface PieChartData {
  name: string;
  value: number;
  color?: string;
}

export type DonutTooltipPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface DonutWithCenterProps {
  data: PieChartData[];
  /** Texto descritivo no centro (ex.: "Total"). */
  centerLabel: string;
  /** Valor formatado no centro (ex.: "1.234"). */
  centerValue: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  showPercentInTooltip?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Callback opcional quando o usuário clica numa fatia.
   * Recebe `name` (label da fatia) e `index` na lista filtrada.
   */
  onSliceClick?: (name: string, index: number) => void;
  /** Posição do tooltip dentro do container (default: "top-right"). */
  tooltipPosition?: DonutTooltipPosition;
  /** Quando fornecido, exibe segunda linha no centro (abaixo da linha principal). */
  secondaryValue?: string;
  secondaryLabel?: string;
}

export interface DonutTooltipStackedProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  formatValue?: (v: number) => string;
  className?: string;
}

/**
 * Tooltip empilhado (nome em cima, valor formatado embaixo) usado pelo
 * DonutWithCenter quando o tooltip é fixado lateralmente. Garante que valores
 * longos como `R$ 0,1234 (12,3%)` quebrem em duas linhas e respeitem
 * `max-w-[180px]`.
 */
export function DonutTooltipStacked({
  active,
  payload,
  formatValue,
  className,
}: DonutTooltipStackedProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (!entry) return null;

  const numericValue =
    typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
  const formattedValue = formatValue
    ? formatValue(numericValue)
    : Number.isFinite(numericValue)
      ? numericValue.toLocaleString("pt-BR")
      : "—";
  const name = String(entry.name ?? entry.dataKey ?? "");

  return (
    <div
      role="tooltip"
      className={cn(
        "max-w-[180px] rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md",
        className,
      )}
    >
      <p className="font-medium text-foreground">{name}</p>
      <p className="text-muted-foreground tabular-nums">{formattedValue}</p>
    </div>
  );
}

/**
 * Calcula `wrapperStyle` absoluto para o `<Tooltip>` do recharts conforme
 * `tooltipPosition`. Mantém z-index alto (50) para ficar acima da legenda
 * dentro do mesmo container.
 *
 * Exportado para testabilidade — não é parte da API pública.
 */
export function donutTooltipWrapperStyle(
  pos: DonutTooltipPosition,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    zIndex: 50,
    pointerEvents: "none",
  };
  switch (pos) {
    case "top-left":
      return { ...base, top: 8, left: 8 };
    case "top-right":
      return { ...base, top: 8, right: 8 };
    case "bottom-left":
      return { ...base, bottom: 8, left: 8 };
    case "bottom-right":
      return { ...base, bottom: 8, right: 8 };
  }
}

/**
 * Donut chart com texto centralizado no buraco.
 *
 * Caso de uso: dashboards onde o donut representa composição de um total,
 * e o total fica em destaque no centro (ex.: distribuição de status sobre N
 * conversas).
 *
 * - Hover destaca slice ativo (opacity das demais cai para 0.45);
 * - Tooltip near-mouse (default Recharts) com `offset=12` e
 *   `allowEscapeViewBox`, segue o cursor sem cobrir o donut nem ficar fixo
 *   num canto longe do mouse;
 * - Centro sempre legível (texto sobre var(--color-card) implícito) com
 *   `px-6` pra respiro horizontal;
 * - Empty state explicativo.
 */
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 360,
  innerRadius = 75,
  outerRadius = 110,
  emptyMessage,
  emptyHint,
  formatValue,
  showPercentInTooltip = true,
  className,
  ariaLabel = "Donut chart",
  onSliceClick,
  tooltipPosition = "top-right",
  secondaryValue,
  secondaryLabel,
}: DonutWithCenterProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const filtered = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = filtered.reduce((acc, d) => acc + d.value, 0);

  if (total <= 0) {
    return (
      <EmptyChartState
        message={emptyMessage ?? "Sem dados para exibir"}
        hint={emptyHint}
        height={height}
        className={className}
      />
    );
  }

  const formatTooltipValue = (v: number) => {
    const base = formatValue
      ? formatValue(v)
      : Number.isFinite(v)
        ? v.toLocaleString("pt-BR")
        : "—";
    if (!showPercentInTooltip) return base;
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
    return `${base} (${pct}%)`;
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={{ height, width: "100%", position: "relative" }}
      role="img"
      aria-label={`${ariaLabel}: ${centerLabel} ${centerValue}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip
            cursor={false}
            wrapperStyle={donutTooltipWrapperStyle(tooltipPosition)}
            content={(props: { active?: boolean; payload?: unknown }) => (
              <DonutTooltipStacked
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                formatValue={formatTooltipValue}
              />
            )}
          />
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="var(--color-card)"
            strokeWidth={2}
            isAnimationActive={!prefersReducedMotion}
            animationBegin={0}
            animationDuration={800}
            cursor={onSliceClick ? "pointer" : "default"}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={
              onSliceClick
                ? (_, i) => {
                    const item = filtered[i];
                    if (item) onSliceClick(item.name, i);
                  }
                : undefined
            }
          >
            {filtered.map((entry, i) => (
              <Cell
                key={`${entry.name}-${i}`}
                fill={
                  entry.color ??
                  CHART_PALETTE[i] ??
                  getColorByIndex(i)
                }
                opacity={
                  activeIndex === null || activeIndex === i ? 1 : 0.45
                }
                style={{ transition: "opacity 200ms ease" }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        data-slot="donut-center"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center"
      >
        {secondaryValue ? (
          <>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold tabular-nums text-foreground leading-tight">
                {centerValue}
              </span>
              <span className="max-w-[70%] text-[10px] uppercase tracking-wide text-muted-foreground">
                {centerLabel}
              </span>
            </div>
            <div className="h-px w-8 bg-border/60 my-0.5" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold tabular-nums text-foreground leading-tight">
                {secondaryValue}
              </span>
              <span className="max-w-[70%] text-[10px] uppercase tracking-wide text-muted-foreground">
                {secondaryLabel}
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {centerValue}
            </span>
            <span className="max-w-[60%] text-xs uppercase tracking-wide text-muted-foreground">
              {centerLabel}
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}
