"use client";

// Visualização em LISTA DE CARDS RANQUEADA (alternativa a pizza/barra/linha).
// Cada card: posição (#1, #2…), nome, valor e barra de proporção + % do total.
// Pedido do cliente: "pode ser uma lista de cards, com ordenação e um número
// indicando posição/ranking". ui-ux-pro-max: dark+violeta, hover 150ms, tabular.

import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

import { cn } from "@/lib/utils";
import { brl, brlCompacto } from "@/components/diretoria/kit/format";

export interface ItemRanking {
  nome: string;
  valor: number;
  /** Linha de apoio opcional (ex.: "12 notas"). */
  sub?: string;
}

export function RankingCards({
  itens,
  max = 12,
  rotuloValor = "valor",
}: {
  itens: ItemRanking[];
  max?: number;
  rotuloValor?: string;
}) {
  const [desc, setDesc] = useState(true);

  const total = itens.reduce((s, i) => s + i.valor, 0) || 1;
  const ordenado = [...itens]
    .sort((a, b) => (desc ? b.valor - a.valor : a.valor - b.valor))
    .slice(0, max);
  const topo = Math.max(...ordenado.map((i) => i.valor), 1);

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Top {ordenado.length} por {rotuloValor}
        </span>
        <button
          type="button"
          onClick={() => setDesc((d) => !d)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={desc ? "Ordenar crescente" : "Ordenar decrescente"}
        >
          {desc ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
          {desc ? "Maior" : "Menor"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
        {ordenado.map((it, i) => {
          const posReal = desc ? i + 1 : ordenado.length - i;
          const pctTotal = (it.valor / total) * 100;
          const pctTopo = (it.valor / topo) * 100;
          const podio = desc && i < 3;
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
