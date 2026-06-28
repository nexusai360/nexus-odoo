"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

// Paleta sequencial de roxos (mantém o accent do produto).
const ROXOS = [
  "#7c5cfc",
  "#8d72fd",
  "#9e88fd",
  "#af9efe",
  "#a07bff",
  "#6f4fe0",
  "#b8a4ff",
  "#5b3fc4",
];

interface MarcaDatum {
  marca: string;
  valorTotal: number;
}
interface PgtoDatum {
  formaPagamento: string;
  valorTotal: number;
}

function TooltipBox({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium">{nome}</div>
      <div className="text-muted-foreground tabular-nums">{brl.format(valor)}</div>
    </div>
  );
}

/** C4 , Vendas por marca (barras horizontais, top 8). */
export function VendasPorMarcaChart({ data }: { data: MarcaDatum[] }) {
  const top = data.slice(0, 8);
  if (top.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 38)}>
      <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="marca"
          width={120}
          tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "hsl(240 8% 20% / 0.4)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox nome={String(payload[0].payload.marca)} valor={Number(payload[0].value)} />
            ) : null
          }
        />
        <Bar dataKey="valorTotal" radius={[0, 6, 6, 0]}>
          {top.map((_, i) => (
            <Cell key={i} fill={ROXOS[i % ROXOS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** C10 , Formas de pagamento (donut). */
export function FormasPagamentoChart({ data }: { data: PgtoDatum[] }) {
  const top = data.slice(0, 8);
  if (top.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                nome={String(payload[0].payload.formaPagamento)}
                valor={Number(payload[0].value)}
              />
            ) : null
          }
        />
        <Pie
          data={top}
          dataKey="valorTotal"
          nameKey="formaPagamento"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          stroke="hsl(240 10% 6%)"
        >
          {top.map((_, i) => (
            <Cell key={i} fill={ROXOS[i % ROXOS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
