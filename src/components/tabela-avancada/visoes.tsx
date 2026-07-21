"use client";

/**
 * Views especializadas da tabela avançada (genéricas): Kanban (colunas por um
 * campo agrupador) e Calendário (por um campo de data). Lentes sobre a MESMA
 * lista filtrada. CSS puro, sem libs. Portado/adaptado de vendas-visoes.tsx.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampoLike } from "./motor-filtro";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ===== Kanban (colunas por campo agrupador, ex.: etapa) =====

export function KanbanView<T extends Record<string, unknown>>({
  lista,
  campo,
  campoByKey,
  tituloItem,
  subtituloItem,
  valorItem,
}: {
  lista: T[];
  campo: string;
  campoByKey: Record<string, CampoLike>;
  tituloItem?: (row: T) => string;
  subtituloItem?: (row: T) => string;
  valorItem?: (row: T) => string;
}) {
  const chave = (r: T): string => {
    const get = campoByKey[campo]?.get as ((row: T) => string | number | string[]) | undefined;
    const v = get ? get(r) : "";
    return String(Array.isArray(v) ? v.join(", ") : v) || "(vazio)";
  };

  const colunas = useMemo(() => {
    const map = new Map<string, T[]>();
    lista.forEach((r) => { const k = chave(r); if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, campo]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {colunas.map(([nome, itens]) => (
        <div key={nome} className="rounded-xl border border-border bg-card/60 p-2">
          <div className="mb-2 flex items-center justify-between gap-2 px-1.5 py-1">
            <span className="truncate text-sm font-medium text-foreground">{nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{itens.length}</span>
          </div>
          <div className="max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto">
            {itens.map((r, i) => (
              <div key={i} className="w-full rounded-lg border border-border bg-card p-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{tituloItem ? tituloItem(r) : ""}</span>
                  {valorItem && <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{valorItem(r)}</span>}
                </div>
                {subtituloItem && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtituloItem(r)}</p>}
              </div>
            ))}
            {itens.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">vazio</p>}
          </div>
        </div>
      ))}
      {colunas.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Sem dados para exibir.</p>}
    </div>
  );
}

// ===== Calendário (por campo de data) =====

export function CalendarioView<T extends Record<string, unknown>>({
  lista,
  campoData,
  colunaByKey,
  tituloItem,
  valorItem,
}: {
  lista: T[];
  campoData: string;
  colunaByKey: Record<string, { valor: (r: T) => string | number }>;
  tituloItem?: (row: T) => string;
  valorItem?: (row: T) => string;
}) {
  const iso = (r: T): string => {
    const col = colunaByKey[campoData];
    const v = col ? String(col.valor(r)) : "";
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : "";
  };

  const mesInicial = useMemo(() => {
    const cont = new Map<string, number>();
    lista.forEach((r) => { const v = iso(r); if (v) { const ym = v.slice(0, 7); cont.set(ym, (cont.get(ym) ?? 0) + 1); } });
    const top = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!top) return { y: 2026, m: 6 };
    const [y, m] = top.split("-").map(Number);
    return { y, m: m - 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, campoData]);

  const [ref, setRef] = useState(mesInicial);
  const primeiroDia = new Date(ref.y, ref.m, 1).getDay();
  const diasNoMes = new Date(ref.y, ref.m + 1, 0).getDate();

  const porDia = useMemo(() => {
    const map = new Map<number, T[]>();
    lista.forEach((r) => {
      const v = iso(r);
      if (!v) return;
      const [y, m, d] = v.slice(0, 10).split("-").map(Number);
      if (y === ref.y && m - 1 === ref.m) { if (!map.has(d)) map.set(d, []); map.get(d)!.push(r); }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, ref, campoData]);

  const celulas: (number | null)[] = [
    ...Array(primeiroDia).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);

  function move(delta: number) {
    setRef((r) => { const nm = r.m + delta; return { y: r.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
  }

  const semData = lista.filter((r) => !iso(r)).length;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{MESES[ref.m]} {ref.y}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} aria-label="Mês anterior" className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => setRef(mesInicial)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Hoje</button>
          <button type="button" onClick={() => move(1)} aria-label="Próximo mês" className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => <div key={d} className="pb-1 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>)}
        {celulas.map((dia, i) => (
          <div key={i} className={cn("min-h-[5.5rem] rounded-lg border p-1", dia ? "border-border/60 bg-background/40" : "border-transparent")}>
            {dia && (
              <>
                <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{dia}</div>
                <div className="space-y-1">
                  {(porDia.get(dia) ?? []).slice(0, 3).map((r, k) => (
                    <div key={k} title={tituloItem ? tituloItem(r) : ""} className="block w-full truncate rounded bg-violet-500/12 px-1.5 py-0.5 text-left text-[0.7rem] font-medium text-violet-700 dark:text-violet-300">
                      {tituloItem ? tituloItem(r) : ""}{valorItem ? ` · ${valorItem(r)}` : ""}
                    </div>
                  ))}
                  {(porDia.get(dia)?.length ?? 0) > 3 && <span className="block px-1.5 text-[0.65rem] text-muted-foreground">+{(porDia.get(dia)!.length - 3)} mais</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {semData > 0 && <p className="mt-3 text-xs text-muted-foreground">{semData} registro(s) sem data de {campoData} (não aparecem no calendário).</p>}
    </div>
  );
}
