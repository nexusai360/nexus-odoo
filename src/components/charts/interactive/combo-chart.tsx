"use client";

// src/components/charts/interactive/combo-chart.tsx
// Combo barra+linha (ComposedChart) para serie temporal com 2+ series: a 1a
// serie vira BARRA (o realizado/atual), as demais viram LINHA (previsto/meta).
// Reusa o shape "serieTemporal" (mesmo dado da linha), so muda a leitura visual.
import { motion, useReducedMotion } from "framer-motion";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip, type ChartTooltipPayloadItem } from "./chart-tooltip";
import { EmptyChartState } from "./empty-chart-state";
import { getColorByIndex } from "@/components/charts/colors";

export interface ComboChartData {
  name: string;
  [key: string]: string | number;
}

export interface ComboChartSeries {
  key: string;
  label: string;
  color?: string;
}

/** Reparte as series: a primeira e barra, as demais sao linhas. */
export function splitComboSeries(series: ComboChartSeries[]): {
  bars: ComboChartSeries[];
  lines: ComboChartSeries[];
} {
  if (series.length === 0) return { bars: [], lines: [] };
  return { bars: [series[0]], lines: series.slice(1) };
}

export interface InteractiveComboChartProps {
  data: ComboChartData[];
  series: ComboChartSeries[];
  height?: number;
  showLegend?: boolean;
  emptyMessage?: string;
  formatValue?: (v: number) => string;
  ariaLabel?: string;
}

export function InteractiveComboChart({
  data,
  series,
  height = 300,
  showLegend = true,
  emptyMessage = "Sem dados para exibir",
  formatValue = (v) => v.toLocaleString("pt-BR"),
  ariaLabel = "Grafico combinado (barra e linha)",
}: InteractiveComboChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const { bars, lines } = splitComboSeries(series);
  const hasData = data.length > 0 && series.length > 0;
  if (!hasData) {
    return <EmptyChartState message={emptyMessage} height={height} />;
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickMargin={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 12 }}
            width={72}
            tickFormatter={(v) => formatValue(Number(v))}
          />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={(props: { active?: boolean; payload?: unknown; label?: unknown }) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                label={String(props.label ?? "")}
                formatValue={formatValue}
              />
            )}
          />
          {showLegend && series.length > 1 ? (
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          ) : null}
          {bars.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? getColorByIndex(i)}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={700}
            />
          ))}
          {lines.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? getColorByIndex(i + 1)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={700}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
