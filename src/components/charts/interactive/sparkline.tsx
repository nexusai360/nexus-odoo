"use client";

// src/components/charts/interactive/sparkline.tsx
// Sparkline minimalista para KPIs (sem eixo/grid/tooltip). Portado do nexus-insights.
// Reserva altura fixa (evita layout shift); YAxis escondido so para autoescalar a serie.
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { CHART_COLORS } from "@/components/charts/colors";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Serie numerica (uma so, em ordem cronologica). */
  data: number[];
  color?: string;
  height?: number;
  ariaLabel?: string;
  className?: string;
}

export function Sparkline({
  data,
  color = CHART_COLORS.violet,
  height = 36,
  ariaLabel = "Tendencia",
  className,
}: SparklineProps) {
  const gradientId = useId();
  const hasData = data.length > 1 && data.some((n) => Number.isFinite(n) && n > 0);

  if (!hasData) {
    return <div aria-hidden className={cn("w-full", className)} style={{ height }} />;
  }

  const chartData = data.map((v, i) => ({ i, v: Number.isFinite(v) ? v : 0 }));

  return (
    <div role="img" aria-label={ariaLabel} className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
