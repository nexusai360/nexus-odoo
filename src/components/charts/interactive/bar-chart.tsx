"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Bar,
  BarChart,
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
import { PROVIDER_LABELS } from "@/lib/agent/llm/provider-labels";

export interface BarChartData {
  name: string;
  [key: string]: string | number;
}

export interface BarChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface InteractiveBarChartProps {
  data: BarChartData[];
  series: BarChartSeries[];
  height?: number;
  /**
   * Layout do chart:
   * - "vertical" (default): barras sobem (XAxis = name, YAxis = value);
   * - "horizontal": barras crescem para a direita (YAxis = name, XAxis = value).
   */
  layout?: "vertical" | "horizontal";
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
  /**
   * Largura mínima reservada ao YAxis quando layout="horizontal".
   * Ajuste se as labels forem longas.
   */
  yAxisWidth?: number;
  /**
   * Callback disparado ao clicar numa barra. Recebe o `name` da categoria
   * (eixo categórico) e o `seriesKey` clicado.
   */
  onBarClick?: (name: string, seriesKey: string) => void;
  /**
   * Quando definido, sobrescreve o tickFormatter do eixo numérico para
   * formato monetário com 2 casas (locale-aware). Não afeta o tooltip.
   */
  yAxisCurrency?: "USD" | "BRL";
  /**
   * Tamanho da fonte dos ticks do eixo X (default 13).
   */
  xAxisFontSize?: number;
  /**
   * Margem entre os ticks e o eixo X , aplicado como `tickMargin` (default 12).
   */
  xAxisPadding?: number;
  /**
   * Mapa modelo → providerKey. Quando fornecido, o XAxis renderiza um custom
   * tick em 2 linhas: nome do modelo (truncado em 24 chars) + "(Provider)" em
   * fonte menor / opacity reduzida. Aumenta a altura reservada do eixo.
   * Aplica-se apenas ao layout vertical (XAxis categórico).
   */
  providersByModel?: Record<string, string>;
}

const defaultFormat = (v: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR") : ",";

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
    return (v) => (Number.isFinite(v) ? fmt.format(v) : ",");
  }
  if (currency === "USD") {
    const fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v) => (Number.isFinite(v) ? fmt.format(v) : ",");
  }
  return fallback;
}

/**
 * Cria um custom tick para o XAxis categórico que renderiza:
 * 1) nome do modelo (truncado em 24 chars com ellipsis se necessário);
 * 2) Badge SVG inline (rect border + text uppercase opacity 0.6, sem fill)
 *    com o nome do provider , apenas quando mapeado em providersByModel.
 *    Largura calculada dinamicamente (badgeText.length * 5.5 + 12).
 */
function makeCustomBarTick(providersByModel?: Record<string, string>) {
  return function CustomBarTick(tickProps: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: string | number };
  }) {
    const { x = 0, y = 0, payload } = tickProps;
    const numX = typeof x === "number" ? x : Number(x) || 0;
    const numY = typeof y === "number" ? y : Number(y) || 0;
    const value = String(payload?.value ?? "");
    const truncated = value.length > 24 ? `${value.slice(0, 21)}…` : value;
    const provider = providersByModel?.[value];
    const providerLabel = provider
      ? (PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider)
      : "";
    // v0.26.0: case-mixed (OpenAI, Anthropic, Gemini, OpenRouter) , sem .toUpperCase()
    const badgeText = providerLabel;
    // Heurística case-mixed: ~6px/char + 14px padding total (case-mixed ocupa mais que all-caps).
    const badgeWidth = badgeText.length * 6 + 14;
    return (
      <g transform={`translate(${numX},${numY})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fontSize={13}
          fill="currentColor"
        >
          {truncated}
        </text>
        {badgeText ? (
          <g transform="translate(0, 26)">
            <rect
              x={-badgeWidth / 2}
              y={0}
              width={badgeWidth}
              height={14}
              rx={3}
              fill="transparent"
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <text
              x={0}
              y={10}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              opacity={0.7}
              letterSpacing={0.3}
            >
              {badgeText}
            </text>
          </g>
        ) : null}
      </g>
    );
  };
}

/**
 * Bar chart interativo (vertical/horizontal, agrupado/empilhado) com:
 * - animação Recharts 800ms + Framer Motion fade/scale 200ms;
 * - hover: outras séries reduzidas a opacity 0.45;
 * - tooltip rico via ChartTooltip;
 * - grid sutil (sem competir com dados);
 * - empty state explicativo;
 * - prefers-reduced-motion respeitado.
 */
export function InteractiveBarChart({
  data,
  series,
  height = 320,
  layout = "vertical",
  stacked = false,
  showLegend = true,
  showGrid = true,
  emptyMessage,
  emptyHint,
  formatValue = defaultFormat,
  className,
  ariaLabel = "Gráfico de barras",
  yAxisWidth = 80,
  onBarClick,
  yAxisCurrency,
  xAxisFontSize = 13,
  xAxisPadding = 12,
  providersByModel,
}: InteractiveBarChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const numericTickFormatter = makeYAxisFormatter(yAxisCurrency, formatValue);

  // Modo "subcent": valores positivos < R$ 0,01 , eixo numérico mostra apenas
  // 2 ticks (0 e 0.01) com label "< R$ 0,01" no topo. Tooltip preserva real.
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

  const isHorizontal = layout === "horizontal";

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
        <BarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={
            providersByModel && !isHorizontal
              ? { top: 8, right: 16, left: 0, bottom: 20 }
              : { top: 8, right: 16, left: 0, bottom: 4 }
          }
        >
          {showGrid ? (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted/40"
              horizontal={!isHorizontal}
              vertical={isHorizontal}
            />
          ) : null}
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                allowDecimals={yAxisCurrency !== undefined}
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: xAxisFontSize }}
                fontSize={xAxisFontSize}
                tickMargin={xAxisPadding}
                domain={isSubCent ? [0, 0.01] : undefined}
                ticks={isSubCent ? [0, 0.01] : undefined}
                tickFormatter={
                  isSubCent
                    ? subCentTickFormatter
                    : (v) => numericTickFormatter(Number(v))
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                width={yAxisWidth}
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: 13 }}
                fontSize={13}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tick={
                  providersByModel
                    ? makeCustomBarTick(providersByModel)
                    : { fill: "currentColor", fontSize: xAxisFontSize }
                }
                fontSize={xAxisFontSize}
                tickMargin={xAxisPadding}
                height={providersByModel ? 50 : undefined}
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
                    : (v) => numericTickFormatter(Number(v))
                }
              />
            </>
          )}
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
                formatValue={formatValue}
              />
            )}
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
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color}
                stackId={stacked ? "stack" : undefined}
                radius={stacked ? 0 : 6}
                maxBarSize={72}
                // Risquinho minimo: valores > 0 muito pequenos (ex.: custo de
                // embedding < 1 centavo) renderizam ao menos 2px, em vez de
                // sumir. Nao afeta barras normais.
                minPointSize={2}
                fillOpacity={dim ? 0.4 : 1}
                isAnimationActive={!prefersReducedMotion}
                animationBegin={0}
                animationDuration={800}
                style={{
                  transition: "fill-opacity 200ms ease",
                  cursor: onBarClick ? "pointer" : "default",
                }}
                onMouseEnter={() => setActiveKey(s.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={
                  onBarClick
                    ? (entry) => {
                        const payload = entry as { payload?: { name?: string } };
                        const name = payload.payload?.name;
                        if (typeof name === "string") onBarClick(name, s.key);
                      }
                    : undefined
                }
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
