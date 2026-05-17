"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { colorAt } from "./palette";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

export interface LineSeries {
  key: string;
  label: string;
}

export interface LineChartConfig {
  xKey: string;
  formato: NumberFormat;
  series: LineSeries[];
}

interface LineChartCardProps {
  data: Record<string, unknown>[];
  config: LineChartConfig;
  estado?: ChartState;
  onRetry?: () => void;
}

/** Gráfico de linhas multi-série declarativo sobre Recharts. */
export function LineChartCard({
  data, config, estado = "ok", onRetry,
}: LineChartCardProps) {
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
      data-slot="line-chart"
      className="h-72 w-full text-muted-foreground"
      role="img"
      aria-label={`Gráfico de linhas com ${config.series.length} ${
        config.series.length === 1 ? "série" : "séries"
      } ao longo de ${data.length} ${data.length === 1 ? "ponto" : "pontos"}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
          <Legend />
          {config.series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorAt(i)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
