"use client";

// src/components/charts/interactive/waterfall-chart.tsx
// Cascata (waterfall) para DRE: parte da Receita, desce a cada Despesa, fecha no
// Resultado. Usa o shape "cascata" (passos com sinal: positivo/negativo/total).
// Render via recharts BarChart com BARRAS FLUTUANTES (dataKey = [inicio, fim]):
// ao contrario do truque de barra-base transparente, a barra flutuante lida
// corretamente com acumulado NEGATIVO (ex.: resultado < 0) e o eixo Y auto-escala
// no dominio real, sem espelhar. Verde sobe, vermelho desce, accent no total.
import { motion, useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
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
  /** Faixa [inicio, fim] da barra flutuante (lida com negativo). */
  faixa: [number, number];
  /** Magnitude do passo (para o tooltip). */
  valor: number;
  /** Valor acumulado apos este passo. */
  cumulativo: number;
  tipo: PassoCascataTipo;
}

/**
 * Deriva as barras da cascata acumulando do zero. Positivo sobe, negativo desce,
 * total reancora no zero (barra absoluta do resultado, podendo ser negativa).
 * Cada barra e uma FAIXA [inicio, fim]. Sem passos, lista vazia.
 */
export function buildWaterfallBars(passos: PassoCascata[]): BarraCascata[] {
  const bars: BarraCascata[] = [];
  let running = 0;
  for (const p of passos) {
    if (p.tipo === "total") {
      bars.push({ rotulo: p.rotulo, faixa: [0, p.valor], valor: p.valor, cumulativo: p.valor, tipo: p.tipo });
      running = p.valor;
      continue;
    }
    const mag = Math.abs(p.valor);
    const fim = p.tipo === "positivo" ? running + mag : running - mag;
    bars.push({ rotulo: p.rotulo, faixa: [running, fim], valor: mag, cumulativo: fim, tipo: p.tipo });
    running = fim;
  }
  return bars;
}

function corDoTipo(tipo: PassoCascataTipo): string {
  if (tipo === "positivo") return CHART_COLORS.emerald;
  if (tipo === "negativo") return CHART_COLORS.red;
  return CHART_COLORS.violet;
}

/** Trunca rotulo longo para caber no eixo (tooltip mantem o nome inteiro). */
function abreviar(s: string, n = 14): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
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
  height = 340,
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
        <BarChart data={bars} margin={{ top: 8, right: 16, left: 8, bottom: 56 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickMargin={8}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={56}
            tickFormatter={(v) => abreviar(String(v))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 11 }}
            width={84}
            tickFormatter={(v) => formatValue(Number(v))}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={(props: { active?: boolean; payload?: unknown }) => {
              const item = (props.payload as { payload?: BarraCascata }[] | undefined)?.[0]?.payload;
              if (!props.active || !item) return null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-foreground">{item.rotulo}</p>
                  <p className="text-muted-foreground">
                    {item.tipo === "negativo" ? "-" : item.tipo === "positivo" ? "+" : ""}
                    {formatValue(item.valor)}
                  </p>
                  <p className="mt-0.5 text-muted-foreground/80">Acumulado: {formatValue(item.cumulativo)}</p>
                </div>
              );
            }}
          />
          {/* Barra flutuante: dataKey = [inicio, fim]; auto-escala lida com negativo. */}
          <Bar
            dataKey="faixa"
            radius={[3, 3, 3, 3]}
            maxBarSize={64}
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
