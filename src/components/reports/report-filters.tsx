"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReportFilter } from "@/lib/reports/types";
import { ProductFilter, type FilterOption } from "./filter-controls/product-filter";
import { WarehouseFilter } from "./filter-controls/warehouse-filter";
import { FamilyFilter } from "./filter-controls/family-filter";
import { PeriodFilter } from "./filter-controls/period-filter";
import { DirectionFilter } from "./filter-controls/direction-filter";
import { DaysRangeFilter } from "./filter-controls/days-range-filter";
import { SearchFilter } from "./filter-controls/search-filter";

export interface FilterOptions {
  produtos: FilterOption[];
  armazens: FilterOption[];
  familias: FilterOption[];
}

interface ReportFiltersProps {
  filtros: ReportFilter[];
  options: FilterOptions;
}

/**
 * Barra de filtros declarativa: renderiza um controle por filtro da seção e
 * propaga o estado para a URL via searchParams (deep-link + voltar funcionam).
 */
export function ReportFilters({ filtros, options }: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  if (filtros.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filtros.map((f) => {
        switch (f.tipo) {
          case "produto":
            return (
              <ProductFilter
                key="produto"
                value={searchParams.get("produtoId") ?? ""}
                onChange={(v) => setParam({ produtoId: v })}
                options={options.produtos}
              />
            );
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
          case "periodo":
            return (
              <PeriodFilter
                key="periodo"
                de={searchParams.get("periodoDe") ?? ""}
                ate={searchParams.get("periodoAte") ?? ""}
                onChange={({ de, ate }) =>
                  setParam({ periodoDe: de, periodoAte: ate })
                }
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
          case "busca":
            return (
              <SearchFilter
                key="busca"
                value={searchParams.get("busca") ?? ""}
                onChange={(v) => setParam({ busca: v })}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
