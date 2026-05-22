"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartTooltip,
  type ChartTooltipPayloadItem,
} from "./chart-tooltip";
import { EmptyChartState } from "./empty-chart-state";
import { getColorByIndex } from "@/components/charts/colors";

export interface AreaChartData {
  name: string;
  isFuture?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export interface AreaChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface InteractiveAreaChartProps {
  data: AreaChartData[];
  series: AreaChartSeries[];
  height?: number;
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
  /**
   * Quando definido, sobrescreve o tickFormatter do eixo Y para formato
   * monetário com 2 casas decimais (locale-aware). Não afeta `formatValue`
   * usado no Tooltip.
   */
  yAxisCurrency?: "USD" | "BRL";
  /**
   * Tamanho da fonte dos ticks do eixo X (default 13).
   */
  xAxisFontSize?: number;
  /**
   * Margem entre os ticks e o eixo X — aplicado como `tickMargin` (default 12).
   */
  xAxisPadding?: number;
  /**
   * Intervalo entre labels do eixo X (0 = todos, 1 = a cada 2, 2 = a cada 3, …).
   * Útil para gráficos horários onde 24 labels ficam sobrepostos.
   */
  xAxisInterval?: number | "preserveStart" | "preserveEnd" | "preserveStartEnd";
}

const defaultFormat = (v: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR") : "—";

function makeYAxisFormatter(
  currency: "USD" | "BRL" | undefined,
  fallback: (v: number) => string,
): (v: number) => string {
  if (currency === "BRL") {
    const fmt = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v) => (Number.isFinite(v) ? fmt.format(v) : "—");
  }
  if (currency === "USD") {
    const fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v) => (Number.isFinite(v) ? fmt.format(v) : "—");
  }
  return fallback;
}

/**
 * Area chart com gradient fill, animação de entrada e hover.
 *
 * - Gradient sutil no fill (opacity 0.35 -> 0.05) para evitar competir com a
 *   linha — a linha é o foco visual (`trend-emphasis`);
 * - prefers-reduced-motion respeitado;
 * - empty state explicativo;
 * - múltiplas séries empilháveis.
 */
export function InteractiveAreaChart({
  data,
  series,
  height = 320,
  stacked = false,
  showLegend = true,
  showGrid = true,
  emptyMessage,
  emptyHint,
  formatValue = defaultFormat,
  className,
  ariaLabel = "Gráfico de área",
  yAxisCurrency,
  xAxisFontSize = 13,
  xAxisPadding = 12,
  xAxisInterval,
}: InteractiveAreaChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const yTickFormatter = makeYAxisFormatter(yAxisCurrency, formatValue);

  // Modo "subcent": quando todos os valores são positivos e < R$ 0,01,
  // o eixo Y normal mostraria apenas zeros; preferimos 2 ticks fixos
  // (0 e 0.01) com label "< R$ 0,01" no topo, preservando o tooltip
  // com o valor real.
  const maxValue = Math.max(
    0,
    ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)),
  );
  const isSubCent =
    yAxisCurrency !== undefined && maxValue > 0 && maxValue < 0.01;
  const subCentTickFormatter = (v: number) => {
    if (v === 0) return yAxisCurrency === "BRL" ? "R$ 0,00" : "$0.00";
    return yAxisCurrency === "BRL" ? "< R$ 0,01" : "< $0.01";
  };

  const hasData =
    data.length > 0 &&
    series.length > 0 &&
    data.some((row) =>
      series.some((s) => {
        const v = row[s.key];
        return typeof v === "number" && Number.isFinite(v) && v > 0;
      }),
    );

  if (!hasData) {
    return (
      <EmptyChartState
        message={emptyMessage ?? "Sem dados para exibir"}
        hint={emptyHint}
        height={height}
        className={className}
      />
    );
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? getColorByIndex(i);
              return (
                <linearGradient
                  id={`${gradientId}-${s.key}`}
                  key={s.key}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid ? (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted/40"
              vertical={false}
            />
          ) : null}
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: xAxisFontSize }}
            fontSize={xAxisFontSize}
            tickMargin={xAxisPadding}
            interval={xAxisInterval}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            allowDecimals={yAxisCurrency !== undefined}
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 13 }}
            fontSize={13}
            width={yAxisCurrency ? 72 : 48}
            domain={isSubCent ? [0, 0.01] : undefined}
            ticks={isSubCent ? [0, 0.01] : undefined}
            tickFormatter={
              isSubCent
                ? subCentTickFormatter
                : (v) => yTickFormatter(Number(v))
            }
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            content={(props: {
              active?: boolean;
              payload?: unknown;
              label?: unknown;
            }) => {
              const entry = data.find((d) => d.name === String(props.label ?? ""));
              if (entry?.isFuture) return null;
              return (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                  label={String(props.label ?? "")}
                  formatValue={formatValue}
                />
              );
            }}
          />
          {showLegend && series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
              onMouseEnter={(e) => {
                const k = (e as { dataKey?: string }).dataKey;
                if (k) setActiveKey(k);
              }}
              onMouseLeave={() => setActiveKey(null)}
            />
          ) : null}
          {series.map((s, i) => {
            const color = s.color ?? getColorByIndex(i);
            const dim = activeKey !== null && activeKey !== s.key;
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId}-${s.key})`}
                stackId={stacked ? "stack" : undefined}
                fillOpacity={dim ? 0.3 : 1}
                strokeOpacity={dim ? 0.4 : 1}
                connectNulls={false}
                isAnimationActive={!prefersReducedMotion}
                animationBegin={0}
                animationDuration={800}
                activeDot={{ r: 5, strokeWidth: 2, stroke: color, fill: color }}
                style={{
                  transition:
                    "fill-opacity 200ms ease, stroke-opacity 200ms ease",
                }}
                onMouseEnter={() => setActiveKey(s.key)}
                onMouseLeave={() => setActiveKey(null)}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
