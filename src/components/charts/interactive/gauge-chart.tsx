"use client";

// src/components/charts/interactive/gauge-chart.tsx
// Medidor radial (gauge): mostra uma TAXA/percentual num arco (ex.: % de produtos
// negativos, % de meta atingida). Portado do nexus-insights (radial-bar-chart),
// adaptado ao design system daqui. Valor central em destaque + trilha de fundo.
import { motion, useReducedMotion } from "framer-motion";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/components/charts/colors";

/** Clampa o valor em [0, max] e devolve o percentual sobre o max (max<=0 -> 100). */
export function valorMedidor(value: number, max: number): { safeValue: number; pct: number } {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.max(0, Math.min(value, safeMax));
  return { safeValue, pct: Math.round((safeValue / safeMax) * 100) };
}

export interface InteractiveGaugeChartProps {
  /** Valor atual (mesma unidade que max). */
  value: number;
  /** Maximo da escala. Default 100. */
  max?: number;
  /** Rotulo abaixo do valor central. */
  label?: string;
  color?: string;
  size?: number;
  /** Sufixo do valor central (default "%"). */
  valueSuffix?: string;
  formatValue?: (v: number, max: number) => string;
  ariaLabel?: string;
}

export function InteractiveGaugeChart({
  value,
  max = 100,
  label,
  color = CHART_COLORS.violet,
  size = 200,
  valueSuffix = "%",
  formatValue,
  ariaLabel,
}: InteractiveGaugeChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeMax = max > 0 ? max : 100;
  const { safeValue, pct } = valorMedidor(value, safeMax);
  const display = formatValue ? formatValue(safeValue, safeMax) : `${pct}${valueSuffix}`;
  const data = [{ name: label ?? "valor", value: safeValue, fill: color }];

  return (
    <div className="flex w-full items-center justify-center">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ width: size, height: size, position: "relative" }}
        role="img"
        aria-label={ariaLabel ?? `${label ?? "Indicador"}: ${display} de ${safeMax}${valueSuffix}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, safeMax]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "var(--color-muted)", opacity: 0.3 }}
              dataKey="value"
              cornerRadius={999}
              isAnimationActive={!prefersReducedMotion}
              animationBegin={0}
              animationDuration={800}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{display}</span>
          {label ? <span className="max-w-[80%] text-xs text-muted-foreground">{label}</span> : null}
        </div>
      </motion.div>
    </div>
  );
}
