"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { colorAt } from "./palette";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

export interface PieChartConfig {
  nameKey: string;
  valueKey: string;
  formato: NumberFormat;
}

interface PieChartCardProps {
  data: Record<string, unknown>[];
  config: PieChartConfig;
  estado?: ChartState;
  onRetry?: () => void;
}

const MAX_FATIAS = 6;

/**
 * Agrupa as fatias acima de MAX_FATIAS: mantém o top-5 por valor e soma o
 * resto numa fatia "Outros".
 */
export function agruparOutros(
  data: Record<string, unknown>[],
  nameKey: string,
  valueKey: string,
): Record<string, unknown>[] {
  if (data.length <= MAX_FATIAS) return data;
  const ordenado = [...data].sort(
    (a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0),
  );
  const top = ordenado.slice(0, MAX_FATIAS - 1);
  const resto = ordenado.slice(MAX_FATIAS - 1);
  const somaResto = resto.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0);
  return [...top, { [nameKey]: "Outros", [valueKey]: somaResto }];
}

/** Gráfico de pizza declarativo; agrupa "Outros" acima de 6 fatias. */
export function PieChartCard({
  data, config, estado = "ok", onRetry,
}: PieChartCardProps) {
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

  const fatias = agruparOutros(data, config.nameKey, config.valueKey);

  return (
    <div data-slot="pie-chart" className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={fatias}
            dataKey={config.valueKey}
            nameKey={config.nameKey}
            cx="50%"
            cy="50%"
            outerRadius={90}
          >
            {fatias.map((_, i) => (
              <Cell key={i} fill={colorAt(i)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => formatNumber(Number(v), config.formato)}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
