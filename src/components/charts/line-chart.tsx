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
import { paletaApartirDe } from "./colors";
import { ChartTooltip, type ChartTooltipPayloadItem } from "./chart-tooltip";
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
  /** Cor que ancora a paleta das séries (token ou hex). Ausente = padrão. */
  cor?: string;
}

interface LineChartCardProps {
  data: Record<string, unknown>[];
  config: LineChartConfig;
  estado?: ChartState;
  onRetry?: () => void;
}

/**
 * Gráfico de linha/área multi-série, alinhado ao `nexus-insights`:
 * - fill em gradient sutil (a linha é o foco visual);
 * - hover esmaece as demais séries; legenda no topo;
 * - tooltip rico; `allowDecimals` desligado para formatos inteiros.
 */
export function LineChartCard({
  data,
  config,
  estado = "ok",
  onRetry,
}: LineChartCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);

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
  const paleta = paletaApartirDe(config.cor);
  const corSerie = (i: number) => paleta[i % paleta.length];

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-slot="line-chart"
      className="h-72 w-full text-muted-foreground"
      role="img"
      aria-label={`Gráfico de linhas com ${config.series.length} ${
        config.series.length === 1 ? "série" : "séries"
      } ao longo de ${data.length} ${data.length === 1 ? "ponto" : "pontos"}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <defs>
            {config.series.map((s, i) => (
              <linearGradient
                id={`${gradientId}-${s.key}`}
                key={s.key}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={corSerie(i)} stopOpacity={0.35} />
                <stop offset="100%" stopColor={corSerie(i)} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
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
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
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
          {config.series.length > 1 ? (
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
          {config.series.map((s, i) => {
            const color = corSerie(i);
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
                fillOpacity={dim ? 0.25 : 1}
                strokeOpacity={dim ? 0.35 : 1}
                connectNulls={false}
                isAnimationActive={!prefersReducedMotion}
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
