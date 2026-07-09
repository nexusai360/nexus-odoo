"use client";

// src/components/charts/interactive/treemap-chart.tsx
// Treemap (mapa de arvore): proporcao por AREA. Le muitas categorias de uma vez
// (ex.: faturamento por cliente/produto), onde a pizza satura e a barra vira uma
// floresta. Reusa o shape "agregacaoCategorica" (rotulo + valor), como a barra.
import * as React from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { paletaApartirDe } from "@/components/charts/colors";
import { EmptyChartState } from "./empty-chart-state";

export interface TreemapDatum {
  name: string;
  value: number;
  /** recharts Treemap exige index signature no tipo do data. */
  [key: string]: string | number;
}

/** Mantem so categorias positivas e ordena por valor desc (maiores primeiro). */
export function prepararTreemap(data: TreemapDatum[]): TreemapDatum[] {
  return data
    .filter((d) => Number(d.value) > 0)
    .map((d) => ({ name: d.name, value: Number(d.value) }))
    .sort((a, b) => b.value - a.value);
}

export interface InteractiveTreemapChartProps {
  data: TreemapDatum[];
  formatValue?: (v: number) => string;
  color?: string;
  height?: number;
  emptyMessage?: string;
  ariaLabel?: string;
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  paleta: readonly string[];
}

function CelulaTreemap({ x = 0, y = 0, width = 0, height = 0, index = 0, name = "", paleta }: CellProps) {
  const cor = paleta[index % paleta.length];
  const cabe = width > 56 && height > 22;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={cor} stroke="var(--background, #fff)" strokeWidth={2} rx={3} />
      {cabe ? (
        <text x={x + 6} y={y + 16} fontSize={11} fill="#fff" className="drop-shadow">
          {name.length > Math.floor(width / 7) ? `${name.slice(0, Math.floor(width / 7))}…` : name}
        </text>
      ) : null}
    </g>
  );
}

export function InteractiveTreemapChart({
  data,
  formatValue = (v) => v.toLocaleString("pt-BR"),
  color,
  height = 320,
  emptyMessage = "Sem dados para exibir",
  ariaLabel = "Treemap (mapa de arvore)",
}: InteractiveTreemapChartProps) {
  const itens = React.useMemo(() => prepararTreemap(data), [data]);
  if (itens.length === 0) {
    return <EmptyChartState message={emptyMessage} height={height} />;
  }
  const paleta = paletaApartirDe(color);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={itens}
          dataKey="value"
          isAnimationActive={false}
          content={<CelulaTreemap paleta={paleta} />}
        >
          <Tooltip
            cursor={{ fillOpacity: 0.1 }}
            content={(props: { active?: boolean; payload?: unknown }) => {
              const item = (props.payload as { payload?: TreemapDatum }[] | undefined)?.[0]?.payload;
              if (!props.active || !item) return null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-muted-foreground">{formatValue(item.value)}</p>
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </motion.div>
  );
}
