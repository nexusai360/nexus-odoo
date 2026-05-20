"use client";

/**
 * UsageCharts — gráficos da tela de consumo de LLM.
 *
 * Task 5.2b (Onda 5, F5).
 * Portado de nexus-insights/src/components/llm/consumo-content.tsx (seção charts).
 *
 * Gráficos:
 * 1. Área: custo por dia (ou por hora quando pill="hoje").
 * 2. Rosca: distribuição por provider.
 * 3. Barras horizontais: custo por modelo (top-12).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 * Paleta: CHART_COLORS (violet primário, demais por índice).
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, CircuitBoard, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, colorAt } from "@/components/charts/colors";
import type { UsageSummaryV2 } from "@/lib/agent/llm/usage-stats";

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function providerLabel(key: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    openrouter: "OpenRouter",
  };
  return labels[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ChartTooltipContent({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur-sm">
      {label ? <p className="mb-2 font-medium text-foreground">{label}</p> : null}
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium tabular-nums text-foreground">
            {brlFmt.format(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ChartSkeleton({ height = 288 }: { height?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando gráfico"
      className="w-full animate-pulse rounded-xl bg-muted/40"
      style={{ height }}
    />
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UsageChartsProps {
  stats: UsageSummaryV2 | null;
  isLoading: boolean;
  /** "hoje" ativa o modo horário; outros modos usam byDay. */
  isHourly?: boolean;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function UsageCharts({ stats, isLoading, isHourly }: UsageChartsProps) {
  const prefersReducedMotion = useReducedMotion();

  // ---- Área: custo por dia ou por hora ------------------------------------

  const areaData = useMemo(() => {
    if (!stats) return [];
    if (isHourly && stats.byHour) {
      return stats.byHour.map((h) => ({
        name: `${String(h.hour).padStart(2, "0")}:00`,
        Custo: Number(h.costBrl.toFixed(6)),
      }));
    }
    return stats.byDay.map((d) => ({
      name: dayLabelFmt.format(isoLocalToDate(d.day)).replace(".", ""),
      Custo: Number(d.costBrl.toFixed(6)),
    }));
  }, [stats, isHourly]);

  // ---- Rosca: distribuição por provider -----------------------------------

  const providerPieData = useMemo(() => {
    if (!stats) return [];
    return stats.byProvider.map((p, i) => ({
      name: providerLabel(p.provider),
      value: Number(p.costBrl.toFixed(6)),
      color: colorAt(i),
    }));
  }, [stats]);

  const totalBrl = useMemo(
    () => providerPieData.reduce((s, p) => s + p.value, 0),
    [providerPieData],
  );

  const totalBrlFormatted = totalBrl > 0 ? brlFmt.format(totalBrl) : "—";

  // ---- Barras: custo por modelo (top-12) ----------------------------------

  const modelBarData = useMemo(() => {
    if (!stats) return [];
    return stats.byModel.slice(0, 12).map((m) => ({
      name: m.model.length > 24 ? m.model.slice(0, 22) + "…" : m.model,
      Custo: Number(m.costBrl.toFixed(6)),
      provider: providerLabel(m.provider),
    }));
  }, [stats]);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* Linha 1: área (2/3) + rosca (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Gráfico de área — custo por dia/hora */}
        <Card className="rounded-2xl border border-border bg-muted/30 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4 text-violet-500" aria-hidden />
              {isHourly ? "Custo por hora" : "Custo por dia"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : areaData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Sem custos no período
              </div>
            ) : (
              <div className="h-72 w-full" role="img" aria-label={isHourly ? "Custo por hora em BRL" : "Custo diário em BRL"}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.violet} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS.violet} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "currentColor", fontSize: isHourly ? 11 : 12 }}
                      tickMargin={8}
                      interval={isHourly ? 1 : "preserveStartEnd"}
                      className="text-xs text-muted-foreground"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "currentColor", fontSize: 12 }}
                      tickMargin={8}
                      width={72}
                      tickFormatter={(v: number) => brlFmt.format(v)}
                      className="text-xs text-muted-foreground"
                    />
                    <Tooltip
                      cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
                      content={(props) => (
                        <ChartTooltipContent
                          active={props.active}
                          payload={props.payload as unknown as TooltipProps["payload"]}
                          label={String(props.label ?? "")}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="Custo"
                      name="Custo (BRL)"
                      stroke={CHART_COLORS.violet}
                      strokeWidth={2}
                      fill="url(#violetGrad)"
                      connectNulls={false}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.violet, fill: CHART_COLORS.violet }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rosca: distribuição por provider */}
        <Card className="rounded-2xl border border-border bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CircuitBoard className="h-4 w-4 text-violet-500" aria-hidden />
              Por provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : providerPieData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Sem dados de provider
              </div>
            ) : (
              <div className="h-72 w-full" role="img" aria-label="Custo por provider em BRL">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={(props) => (
                        <ChartTooltipContent
                          active={props.active}
                          payload={props.payload as unknown as TooltipProps["payload"]}
                        />
                      )}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                    <Pie
                      data={providerPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                      label={({ cx, cy }) => (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-xs font-bold">
                          {totalBrlFormatted}
                        </text>
                      )}
                      labelLine={false}
                    >
                      {providerPieData.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linha 2: barras por modelo */}
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            Custo por modelo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton height={240} />
          ) : modelBarData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Sem dados por modelo
            </div>
          ) : (
            <div
              className="w-full"
              style={{ height: Math.max(180, modelBarData.length * 36) }}
              role="img"
              aria-label="Custo por modelo em BRL"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modelBarData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    tickFormatter={(v: number) => brlFmt.format(v)}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    width={160}
                    className="text-xs text-muted-foreground"
                  />
                  <Tooltip
                    cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                    content={(props) => (
                      <ChartTooltipContent
                        active={props.active}
                        payload={props.payload as unknown as TooltipProps["payload"]}
                        label={String(props.label ?? "")}
                      />
                    )}
                  />
                  <Bar
                    dataKey="Custo"
                    name="Custo (BRL)"
                    fill={CHART_COLORS.violet}
                    radius={[0, 6, 6, 0]}
                    maxBarSize={28}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={600}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
