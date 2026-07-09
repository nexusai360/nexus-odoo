"use client";

// src/components/charts/interactive/funnel-chart.tsx
// Funil de conversao: estagios empilhados, largura decrescente do topo (maior)
// para a base. Usado para pipeline comercial (lead -> orcamento -> pedido ->
// faturado). Reusa o shape "agregacaoCategorica" (rotulo + valor), igual a barra
// e a pizza: nenhum dado novo, so uma leitura visual de concentracao por estagio.
import * as React from "react";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";
import { paletaApartirDe } from "@/components/charts/colors";
import { EmptyChartState } from "./empty-chart-state";

export interface FunnelDatum {
  name: string;
  value: number;
}

export interface FunnelSegment {
  name: string;
  value: number;
  /** Largura relativa ao maior estagio (topo = 100). */
  widthPct: number;
  /** Fatia do total somado (em %). */
  sharePct: number;
}

/**
 * Deriva os segmentos do funil: ordena por valor decrescente (forma de funil),
 * largura relativa ao topo, fatia sobre o total. Sem dado, lista vazia; total
 * zero nao gera NaN.
 */
export function buildFunnelSegments(data: FunnelDatum[]): FunnelSegment[] {
  const ordenado = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(0, ...ordenado.map((d) => d.value));
  const total = ordenado.reduce((s, d) => s + Math.max(0, d.value), 0);
  return ordenado.map((d) => {
    const v = Math.max(0, d.value);
    return {
      name: d.name,
      value: d.value,
      widthPct: max > 0 ? (v / max) * 100 : 0,
      sharePct: total > 0 ? (v / total) * 100 : 0,
    };
  });
}

export interface InteractiveFunnelChartProps {
  data: FunnelDatum[];
  /** Formatador do valor de cada estagio. */
  formatValue?: (v: number) => string;
  /** Cor base (token da paleta ou hex); deriva tons por estagio. */
  color?: string;
  /** Maximo de estagios (top por valor) , um funil so faz sentido com poucos. */
  maxSegments?: number;
  height?: number;
  emptyMessage?: string;
  ariaLabel?: string;
}

export function InteractiveFunnelChart({
  data,
  formatValue = (v) => String(v),
  color,
  maxSegments = 8,
  height = 320,
  emptyMessage = "Sem dados para exibir",
  ariaLabel = "Grafico de funil",
}: InteractiveFunnelChartProps) {
  const segmentos = React.useMemo(
    () => buildFunnelSegments(data).slice(0, maxSegments),
    [data, maxSegments],
  );
  if (segmentos.length === 0) {
    return <EmptyChartState message={emptyMessage} icon={Filter} height={height} />;
  }
  const paleta = paletaApartirDe(color);
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex w-full flex-col items-center gap-2"
      style={{ minHeight: height }}
    >
      {segmentos.map((s, i) => (
        <div key={`${s.name}-${i}`} className="flex w-full flex-col items-center">
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: `${Math.max(s.widthPct, 8)}%`, opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2 text-white shadow-sm"
            style={{ backgroundColor: paleta[i % paleta.length] }}
          >
            <span className="truncate text-xs font-medium drop-shadow-sm">{s.name}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums drop-shadow-sm">
              {formatValue(s.value)}
            </span>
          </motion.div>
          <span className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {s.sharePct.toFixed(1)}% do total
          </span>
        </div>
      ))}
    </div>
  );
}
