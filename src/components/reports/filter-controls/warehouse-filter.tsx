"use client";

import { useMemo } from "react";
import type { FilterOption } from "./product-filter";
import { FilterSelect } from "./filter-select";

interface WarehouseFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de armazém, alinhado ao design system da F1. */
export function WarehouseFilter({ value, onChange, options }: WarehouseFilterProps) {
  const opcoes = useMemo(
    () => [
      { value: "", label: "Todos os armazéns" },
      ...options.map((o) => ({ value: String(o.id), label: o.nome })),
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
