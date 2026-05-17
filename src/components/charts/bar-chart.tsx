"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_COLORS } from "./palette";
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

/** Gráfico de barras declarativo sobre Recharts. */
export function BarChartCard({
  data, config, estado = "ok", onRetry,
}: BarChartCardProps) {
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

  return (
    <div
      data-slot="bar-chart"
      className="h-72 w-full text-muted-foreground"
      role="img"
      aria-label={`Gráfico de barras com ${data.length} ${
        data.length === 1 ? "categoria" : "categorias"
      }.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-foreground/10"
          />
          <XAxis
            dataKey={config.xKey}
            fontSize={12}
            stroke="currentColor"
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            fontSize={12}
            stroke="currentColor"
            tick={{ fill: "currentColor" }}
            tickFormatter={(v) => formatNumber(Number(v), config.formato)}
          />
          <Tooltip
            formatter={(v) => formatNumber(Number(v), config.formato)}
          />
          <Bar dataKey={config.yKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
