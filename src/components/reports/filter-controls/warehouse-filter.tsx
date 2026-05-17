"use client";

import { useMemo } from "react";
import { limparNomeLocal } from "@/lib/reports/local-nome";
import { FilterSelect } from "./filter-select";
import type { FilterOption } from "@/components/reports/report-filters";

interface WarehouseFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de armazém com nomes limpos via limparNomeLocal. */
export function WarehouseFilter({ value, onChange, options }: WarehouseFilterProps) {
  const opcoes = useMemo(
    () => [
      { value: "", label: "Todos os armazéns" },
      ...options.map((o) => ({
        value: String(o.id),
        label: limparNomeLocal(o.nome).rotulo,
      })),
    ],
    [options],
  );

  return (
    <FilterSelect
      id="filtro-armazem"
      label="Armazém"
      value={value}
      options={opcoes}
      onChange={onChange}
    />
  );
}
