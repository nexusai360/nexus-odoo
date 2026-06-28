"use client";

// src/components/charts/interactive/waterfall-chart.tsx
// Cascata (waterfall) para DRE: parte da Receita, desce a cada Despesa, fecha no
// Resultado. Usa o shape "cascata" (passos com sinal: positivo/negativo/total).
// Render via recharts BarChart empilhado: uma barra-base transparente posiciona a
// barra-delta colorida (verde sobe, vermelho desce, accent no total).
import { motion, useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/components/charts/colors";
import { EmptyChartState } from "./empty-chart-state";

export type PassoCascataTipo = "positivo" | "negativo" | "total";

export interface PassoCascata {
  rotulo: string;
  /** Magnitude (positivo/negativo) ou valor com sinal (total). */
  valor: number;
  tipo: PassoCascataTipo;
}

export interface BarraCascata {
  rotulo: string;
  /** Piso transparente que posiciona a barra colorida. */
  base: number;
  /** Altura da barra colorida (sempre >= 0). */
  delta: number;
  /** Valor acumulado apos este passo. */
  cumulativo: number;
  tipo: PassoCascataTipo;
}

/**
 * Deriva as barras da cascata acumulando do zero. Positivo soma (sobe),
 * negativo subtrai (desce e a barra fica ancorada no novo piso), total
 * reancora no zero (barra absoluta do resultado). Sem passos, lista vazia.
 */
export function buildWaterfallBars(passos: PassoCascata[]): BarraCascata[] {
  const bars: BarraCascata[] = [];
  let running = 0;
  for (const p of passos) {
    if (p.tipo === "total") {
      const cumulativo = p.valor;
      bars.push({
        rotulo: p.rotulo,
        base: Math.min(0, cumulativo),
        delta: Math.abs(cumulativo),
        cumulativo,
        tipo: p.tipo,
      });
      running = cumulativo;
      continue;
    }
    const mag = Math.abs(p.valor);
    if (p.tipo === "positivo") {
      bars.push({ rotulo: p.rotulo, base: running, delta: mag, cumulativo: running + mag, tipo: p.tipo });
      running += mag;
    } else {
      const cumulativo = running - mag;
      bars.push({ rotulo: p.rotulo, base: cumulativo, delta: mag, cumulativo, tipo: p.tipo });
      running = cumulativo;
    }
  }
  return bars;
}

function corDoTipo(tipo: PassoCascataTipo): string {
  if (tipo === "positivo") return CHART_COLORS.emerald;
  if (tipo === "negativo") return CHART_COLORS.red;
  return CHART_COLORS.violet;
}

export interface InteractiveWaterfallChartProps {
  passos: PassoCascata[];
  formatValue?: (v: number) => string;
  height?: number;
  emptyMessage?: string;
  ariaLabel?: string;
}

export function InteractiveWaterfallChart({
  passos,
  formatValue = (v) => v.toLocaleString("pt-BR"),
  height = 320,
  emptyMessage = "Sem dados para exibir",
  ariaLabel = "Grafico de cascata",
}: InteractiveWaterfallChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const bars = buildWaterfallBars(passos);
  if (bars.length === 0) {
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
        <BarChart data={bars} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickMargin={10}
            interval={0}
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
            content={(props: { active?: boolean; payload?: unknown }) => {
              const item = (props.payload as { payload?: BarraCascata }[] | undefined)?.[0]?.payload;
              if (!props.active || !item) return null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-foreground">{item.rotulo}</p>
                  <p className="text-muted-foreground">
                    {item.tipo === "negativo" ? "-" : ""}
                    {formatValue(item.delta)}
                  </p>
                  <p className="mt-0.5 text-muted-foreground/80">Acumulado: {formatValue(item.cumulativo)}</p>
                </div>
              );
            }}
          />
          {/* Base transparente: empurra a barra colorida para o piso certo. */}
          <Bar dataKey="base" stackId="cascata" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey="delta"
            stackId="cascata"
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={700}
          >
            {bars.map((b, i) => (
              <Cell key={`${b.rotulo}-${i}`} fill={corDoTipo(b.tipo)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
