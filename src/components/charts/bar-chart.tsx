"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorAt } from "./colors";
import { ChartTooltip, type ChartTooltipPayloadItem } from "./chart-tooltip";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

export interface BarChartConfig {
  xKey: string;
  yKey: string;
  formato: NumberFormat;
}

interface BarChartCardProps {
  data: Record<string, unknown>[];
  config: BarChartConfig;
  estado?: ChartState;
  onRetry?: () => void;
}

/**
 * Gráfico de barras sobre Recharts, alinhado ao `nexus-insights`:
 * - entrada animada (fade/scale 200ms) com `prefers-reduced-motion`;
 * - tooltip rico via `ChartTooltip`;
 * - grid sutil, eixos sem linha, cantos arredondados;
 * - `allowDecimals` desligado para formatos inteiros — sem ticks "0,5".
 */
export function BarChartCard({
  data,
  config,
  estado = "ok",
  onRetry,
}: BarChartCardProps) {
  const prefersReducedMotion = useReducedMotion();

  if (estado === "preparando") return <ChartPreparing />;
  if (estado === "erro") {
    return (
      <ChartError
        message="Erro ao carregar o gráfico."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }
  if (estado === "vazio" || data.length === 0) return <ChartEmpty />;

  const fmt = (v: number) => formatNumber(v, config.formato);
  const allowDecimals = config.formato !== "inteiro";

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-slot="bar-chart"
      className="h-72 w-full text-muted-foreground"
      role="img"
      aria-label={`Gráfico de barras com ${data.length} ${
        data.length === 1 ? "categoria" : "categorias"
      }.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-muted/40"
            vertical={false}
          />
          <XAxis
            dataKey={config.xKey}
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
            allowDecimals={allowDecimals}
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickMargin={8}
            width={config.formato === "moeda" ? 84 : 52}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={(props: {
              active?: boolean;
              payload?: unknown;
              label?: unknown;
            }) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                label={String(props.label ?? "")}
                formatValue={fmt}
              />
            )}
          />
          <Bar
            dataKey={config.yKey}
            name="Valor"
            fill={colorAt(0)}
            radius={[6, 6, 0, 0]}
            maxBarSize={64}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
