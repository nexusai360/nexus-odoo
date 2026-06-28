"use client";

import { useMemo, useState } from "react";

import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { formatarDelta } from "@/lib/diretoria/cores";

export interface UfVendaDatum {
  uf: string;
  valor: number;
  quantidade: number;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

const CLASSE_DELTA: Record<string, string> = {
  positivo: "text-emerald-400",
  negativo: "text-rose-400",
  neutro: "text-muted-foreground",
};

/**
 * Mapa do Brasil de vendas por UF (C3) + comparativo de 2 estados (C8/C9). Ao
 * selecionar 2 UFs no mapa, mostra os dois lado a lado com a variação percentual.
 */
export function VendasMapaComparativo({ data }: { data: UfVendaDatum[] }) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  const porUf = useMemo(() => {
    const m = new Map<string, UfVendaDatum>();
    for (const d of data) m.set(d.uf, d);
    return m;
  }, [data]);

  const mapData = data.map((d) => ({ uf: d.uf, valor: d.valor }));

  const [a, b] = selecionadas;
  const da = a ? porUf.get(a) : undefined;
  const db = b ? porUf.get(b) : undefined;
  const delta =
    da && db ? formatarDelta(da.valor, db.valor) : null;

  return (
    <div className="flex flex-col gap-5">
      <BrazilMap
        data={mapData}
        metric="Faturamento"
        maxSelection={2}
        onSelect={setSelecionadas}
        formatValor={(v) => brl.format(v)}
      />

      {da || db ? (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Comparativo de estados
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[da, db].map((d, i) =>
              d ? (
                <div key={d.uf} className="rounded-lg bg-card/60 p-4">
                  <div className="text-sm font-semibold">{d.uf}</div>
                  <div className="mt-1 font-[var(--font-space-grotesk)] text-2xl font-semibold tabular-nums">
                    {brl.format(d.valor)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {num.format(d.quantidade)} notas
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground"
                >
                  Selecione outro estado no mapa
                </div>
              ),
            )}
          </div>
          {delta ? (
            <div className="mt-3 text-sm">
              <span className="text-muted-foreground">{da?.uf} vs {db?.uf}: </span>
              <span className={CLASSE_DELTA[delta.classe]}>
                {delta.simbolo} {Math.abs(Math.round(delta.pct))}%
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dica: clique em dois estados no mapa para compará-los.
        </p>
      )}
    </div>
  );
}
