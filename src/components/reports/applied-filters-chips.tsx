"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Definição de um chip de filtro aplicado.
 * Cada chip corresponde a um searchParam com rótulo amigável e valor humanizado.
 */
export interface FiltroAtivoChip {
  /** Chave do searchParam (ex.: "armazemId") */
  param: string;
  /** Rótulo do campo (ex.: "Armazém") */
  rotulo: string;
  /** Valor humanizado (ex.: "Jds - Matriz DF") */
  valorLabel: string;
}

interface AppliedFiltersChipsProps {
  /** Lista de chips gerada pelo parent com base nos searchParams ativos. */
  chips: FiltroAtivoChip[];
}

/**
 * Chips de filtros aplicados , um chip por filtro ativo.
 *
 * Cada chip exibe `Rótulo: Valor` com um botão X para remover apenas aquele
 * filtro. Um botão "Limpar todos" ao final remove todos os params de uma vez.
 *
 * Lê/escreve searchParams via `useRouter` (deep-link preservado).
 * Não renderiza nada quando não há filtros ativos.
 *
 * Design (ui-ux-pro-max §1/§2):
 * - `min-h-[36px]` no chip ≥ 36px de alvo de toque (paddings compensam)
 * - botão X com `aria-label` descritivo e `cursor-pointer`
 * - contraste: bg `muted/40` + `border-border/60` + texto `foreground`
 * - anel de foco visível em todos os interativos
 */
export function AppliedFiltersChips({ chips }: AppliedFiltersChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const removeParam = useCallback(
    (param: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(param);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const chip of chips) {
      params.delete(chip.param);
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams, chips]);

  if (chips.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Filtros aplicados"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <span
          key={chip.param}
          role="listitem"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground"
        >
          <span className="truncate max-w-[200px]">
            <span className="font-medium">{chip.rotulo}:</span>{" "}
            {chip.valorLabel}
          </span>
          <button
            type="button"
            onClick={() => removeParam(chip.param)}
            aria-label={`Remover filtro ${chip.rotulo}`}
            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}

      {chips.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          aria-label="Limpar todos os filtros"
          className="h-8 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Limpar todos
        </Button>
      )}
    </div>
  );
}

export default AppliedFiltersChips;
