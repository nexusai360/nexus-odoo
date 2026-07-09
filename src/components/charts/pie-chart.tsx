"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { paletaApartirDe } from "./colors";
import { ChartTooltip, type ChartTooltipPayloadItem } from "./chart-tooltip";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

export interface PieChartConfig {
  nameKey: string;
  valueKey: string;
  formato: NumberFormat;
  /** Cor que ancora a paleta (token ou hex). Ausente = paleta padrão. */
  cor?: string;
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

/**
 * Gráfico de rosca (donut) sobre Recharts, alinhado ao `nexus-insights`:
 * - entrada animada; hover esmaece as demais fatias;
 * - tooltip rico com valor + percentual; legenda inferior;
 * - agrupa "Outros" acima de 6 fatias.
 */
export function PieChartCard({
  data,
  config,
  estado = "ok",
  onRetry,
}: PieChartCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  const fatias = agruparOutros(data, config.nameKey, config.valueKey).filter(
    (f) => Number(f[config.valueKey] ?? 0) > 0,
  );
  const total = fatias.reduce(
    (s, f) => s + Number(f[config.valueKey] ?? 0),
    0,
  );

  if (total <= 0) return <ChartEmpty />;

  const paleta = paletaApartirDe(config.cor);

  const fmt = (v: number) => {
    const base = formatNumber(v, config.formato);
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
    return `${base} (${pct}%)`;
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-slot="pie-chart"
      className="h-72 w-full"
      role="img"
      aria-label={`Gráfico de rosca com ${fatias.length} ${
        fatias.length === 1 ? "fatia" : "fatias"
      }.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip
            content={(props: { active?: boolean; payload?: unknown }) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                formatValue={fmt}
              />
            )}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8, lineHeight: "1.5rem" }}
          />
          <Pie
            data={fatias}
            dataKey={config.valueKey}
            nameKey={config.nameKey}
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={96}
            paddingAngle={2}
            stroke="var(--color-card)"
            strokeWidth={2}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={800}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {fatias.map((entry, i) => (
              <Cell
                key={`${String(entry[config.nameKey])}-${i}`}
                fill={paleta[i % paleta.length]}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                style={{ transition: "opacity 200ms ease" }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
