"use client";

// Mini gráfico (sparkline) para KPIs , linha + área em SVG puro (sem recharts,
// que é pesado demais para um card pequeno). Padrão Router/Consumo do Nex.
// Cor herdada por `currentColor`; o chamador define a classe de cor (tom).

import { useId } from "react";
import { cn } from "@/lib/utils";

export function Sparkline({
  data,
  className,
  altura = 28,
}: {
  data: number[];
  /** Classe de cor (ex.: "text-violet-400"). O traço usa currentColor. */
  className?: string;
  altura?: number;
}) {
  const gid = useId();
  if (data.length < 2) return null;

  const W = 100;
  const H = altura;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1; // 1px de respiro topo/base
    return [x, y] as const;
  });
  const linha = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${linha} L${W},${H} L0,${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} stroke="none" />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
