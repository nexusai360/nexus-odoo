"use client";

// Visualização em LISTA DE CARDS RANQUEADA (alternativa a pizza/barra/linha).
// Cada card: posição (#1, #2…), nome, valor e barra de proporção + % do total.
// Pedido do cliente: "pode ser uma lista de cards, com ordenação e um número
// indicando posição/ranking". ui-ux-pro-max: dark+violeta, hover 150ms, tabular.

import { useState } from "react";

import { cn } from "@/lib/utils";
import { brl, brlCompacto } from "@/components/diretoria/kit/format";

export interface ItemRanking {
  nome: string;
  valor: number;
  /** Linha de apoio opcional (ex.: "12 notas"). */
  sub?: string;
}

type Ordenacao = "valor_desc" | "valor_asc" | "nome_asc" | "nome_desc";

const ORDENS: { valor: Ordenacao; label: string }[] = [
  { valor: "valor_desc", label: "Maior valor" },
  { valor: "valor_asc", label: "Menor valor" },
  { valor: "nome_asc", label: "Nome (A → Z)" },
  { valor: "nome_desc", label: "Nome (Z → A)" },
];
const QUANTIDADES = [10, 15, 25, 50, 100, 0]; // 0 = todos

const selectCls =
  "h-7 cursor-pointer rounded-md border border-border bg-muted/30 px-2 text-xs text-foreground transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RankingCards({
  itens,
  max = 15,
  rotuloValor = "valor",
}: {
  itens: ItemRanking[];
  max?: number;
  rotuloValor?: string;
}) {
  const [ord, setOrd] = useState<Ordenacao>("valor_desc");
  const [topN, setTopN] = useState(max);

  const total = itens.reduce((s, i) => s + i.valor, 0) || 1;
  const ordenadoTudo = [...itens].sort((a, b) => {
    switch (ord) {
      case "valor_asc": return a.valor - b.valor;
      case "nome_asc": return a.nome.localeCompare(b.nome, "pt-BR");
      case "nome_desc": return b.nome.localeCompare(a.nome, "pt-BR");
      default: return b.valor - a.valor;
    }
  });
  const ordenado = topN === 0 ? ordenadoTudo : ordenadoTudo.slice(0, topN);
  const topo = Math.max(...ordenado.map((i) => i.valor), 1);
  const podioAtivo = ord === "valor_desc";

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {topN === 0 ? `Todos (${ordenado.length})` : `Top ${ordenado.length}`} por {rotuloValor}
        </span>
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="rank-ord">Ordenar por</label>
          <select id="rank-ord" className={selectCls} value={ord} onChange={(e) => setOrd(e.target.value as Ordenacao)}>
            {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="rank-qtd">Quantidade</label>
          <select id="rank-qtd" className={selectCls} value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            {QUANTIDADES.map((q) => <option key={q} value={q}>{q === 0 ? "Todos" : `Top ${q}`}</option>)}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
        {ordenado.map((it, i) => {
          const posReal = i + 1;
          const pctTotal = (it.valor / total) * 100;
          const pctTopo = (it.valor / topo) * 100;
          const podio = podioAtivo && i < 3;
          return (
            <div
              key={`${it.nome}-${i}`}
              className="rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-colors hover:border-violet-500/40 hover:bg-muted/30"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                    podio ? "bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/40" : "bg-muted text-muted-foreground",
                  )}
                >
                  {posReal}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground" title={it.nome}>{it.nome}</div>
                  {it.sub ? <div className="truncate text-[11px] text-muted-foreground">{it.sub}</div> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums" title={brl.format(it.valor)}>
                  {brlCompacto(it.valor)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pctTopo}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {pctTotal.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
