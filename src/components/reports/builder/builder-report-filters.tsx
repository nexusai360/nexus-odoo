"use client";

// src/components/reports/builder/builder-report-filters.tsx
// F6 , barra de filtros-pilula do RELATORIO (nao-fixa, rola junto), no padrao do
// Consumo: recortes (armazem/familia) que re-resolvem os graficos AO VIVO. So mostra
// os recortes que o conjunto de fatos do relatorio realmente aceita (dimensoesDisponiveis).
// Periodo (mensal) e o navegador entram so no bloco temporal (D4), nao aqui.
import { useEffect, useState } from "react";
import { WarehouseFilter } from "@/components/reports/filter-controls/warehouse-filter";
import { FamilyFilter } from "@/components/reports/filter-controls/family-filter";
import { listarDimensoesFiltro, type FiltrosRuntime } from "@/lib/actions/relatorio-filtros";
import { dimensoesDisponiveis, type DimensoesFiltro } from "@/lib/reports/builder/dimensoes-filtro";

export function BuilderReportFilters({
  fatos,
  filtros,
  onChange,
}: {
  fatos: string[];
  filtros: FiltrosRuntime;
  onChange: (f: FiltrosRuntime) => void;
}) {
  const [dims, setDims] = useState<DimensoesFiltro>({ armazens: [], familias: [] });
  useEffect(() => {
    let vivo = true;
    listarDimensoesFiltro()
      .then((d) => {
        if (vivo) setDims(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const disp = dimensoesDisponiveis(fatos);
  if (!disp.armazem && !disp.familia) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filtros do relatorio">
      {disp.armazem ? (
        <WarehouseFilter
          value={filtros.armazemId ? String(filtros.armazemId) : ""}
          options={dims.armazens}
          onChange={(v) => onChange({ ...filtros, armazemId: v ? Number(v) : undefined })}
        />
      ) : null}
      {disp.familia ? (
        <FamilyFilter
          value={filtros.familiaId ? String(filtros.familiaId) : ""}
          options={dims.familias}
          onChange={(v) => onChange({ ...filtros, familiaId: v ? Number(v) : undefined })}
        />
      ) : null}
    </div>
  );
}
