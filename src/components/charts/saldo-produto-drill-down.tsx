"use client";

import { cn } from "@/lib/utils";
import { formatNumber } from "./kpi-card";
import type { DetalhePorLocal } from "@/lib/actions/report-data";

interface SaldoProdutoDrillDownProps {
  detalhes: DetalhePorLocal[];
  produtoNome: string;
}

/**
 * Mini-tabela de detalhamento por local de um produto.
 * Renderizada dentro do `expandDetail` da `DataTable` do relatório saldo-produto.
 */
export function SaldoProdutoDrillDown({
  detalhes,
  produtoNome,
}: SaldoProdutoDrillDownProps) {
  if (detalhes.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        Nenhum detalhe por local disponível.
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`Detalhe por local , ${produtoNome}`}
      className="border-l-2 border-primary/20 bg-muted/15 px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Detalhe por local
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50">
            <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wide">
              Local
            </th>
            <th className="pb-1.5 text-right font-medium text-muted-foreground uppercase tracking-wide tabular-nums">
              Saldo
            </th>
            <th className="pb-1.5 text-right font-medium text-muted-foreground uppercase tracking-wide tabular-nums">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {detalhes.map((d) => (
            <tr
              key={d.localRotulo}
              className="border-b border-border/20 last:border-0"
            >
              <td className="py-1.5 pr-4 text-foreground/90 max-w-[260px] truncate" title={d.localRotulo}>
                {d.localRotulo}
              </td>
              <td
                className={cn(
                  "py-1.5 text-right tabular-nums",
                  d.saldo < 0 ? "text-destructive" : "text-foreground/90",
                )}
              >
                {formatNumber(d.saldo, "decimal")}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/90">
                {formatNumber(d.valor, "moeda")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
