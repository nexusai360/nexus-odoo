"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportFilter } from "@/lib/reports/types";
import { WarehouseFilter } from "./filter-controls/warehouse-filter";
import { FamilyFilter } from "./filter-controls/family-filter";
import { DirectionFilter } from "./filter-controls/direction-filter";
import { DaysRangeFilter } from "./filter-controls/days-range-filter";
import { FiltersDialog } from "./filters-dialog";
import { limparNomeLocal } from "@/lib/reports/local-nome";

export interface FilterOption {
  id: number;
  nome: string;
}

export interface FilterOptions {
  armazens: FilterOption[];
  familias: FilterOption[];
}

interface ReportFiltersProps {
  filtros: ReportFilter[];
  options: FilterOptions;
  /** Controla a abertura do FiltersDialog externamente (ex.: via atalho de teclado). */
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

/**
 * Barra de filtros declarativa: renderiza controles inline por filtro da seção
 * + botão "Filtros" que abre o FiltersDialog (modo Simples/Avançado).
 *
 * O estado é propagado via searchParams (deep-link + voltar funcionam).
 */
export function ReportFilters({
  filtros,
  options,
  externalOpen,
  onExternalOpenChange,
}: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sincroniza abertura externa (atalho de teclado)
  useEffect(() => {
    if (externalOpen) {
      setDialogOpen(true);
      onExternalOpenChange?.(false);
    }
  }, [externalOpen, onExternalOpenChange]);

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Campos disponíveis para o modo Avançado: derivados das opções de filtro
  const campos = useMemo(() => {
    const base: { value: string; label: string }[] = [];
    const tipos = new Set(filtros.map((f) => f.tipo));

    if (tipos.has("armazem")) {
      base.push(
        ...options.armazens.map((a) => ({
          value: `armazemId:${a.id}`,
          label: limparNomeLocal(a.nome).rotulo,
        })),
      );
      // Campo genérico armazemId
      base.push({ value: "armazemId", label: "Armazém (id)" });
    }
    if (tipos.has("familia")) {
      base.push({ value: "familiaId", label: "Família (id)" });
    }
    if (tipos.has("sentido")) {
      base.push({ value: "sentido", label: "Sentido" });
    }
    if (tipos.has("faixaDias")) {
      base.push({ value: "faixaDias", label: "Faixa de dias parado" });
    }

    return base;
  }, [filtros, options]);

  if (filtros.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        {filtros.map((f) => {
          switch (f.tipo) {
            case "armazem":
              return (
                <WarehouseFilter
                  key="armazem"
                  value={searchParams.get("armazemId") ?? ""}
                  onChange={(v) => setParam({ armazemId: v })}
                  options={options.armazens}
                />
              );
            case "familia":
              return (
                <FamilyFilter
                  key="familia"
                  value={searchParams.get("familiaId") ?? ""}
                  onChange={(v) => setParam({ familiaId: v })}
                  options={options.familias}
                />
              );
            case "sentido":
              return (
                <DirectionFilter
                  key="sentido"
                  value={searchParams.get("sentido") ?? ""}
                  onChange={(v) => setParam({ sentido: v })}
                />
              );
            case "faixaDias":
              return (
                <DaysRangeFilter
                  key="faixaDias"
                  value={searchParams.get("faixaDias") ?? f.default ?? "30"}
                  onChange={(v) => setParam({ faixaDias: v })}
                />
              );
            default:
              return null;
          }
        })}

        {/* Botão que abre o FiltersDialog */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          aria-label="Abrir diálogo de filtros"
          className="h-8 cursor-pointer gap-1.5 self-end text-xs"
        >
          <Filter className="size-3.5" aria-hidden />
          Filtros
        </Button>
      </div>

      <FiltersDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        options={options}
        campos={campos}
      />
    </>
  );
}
