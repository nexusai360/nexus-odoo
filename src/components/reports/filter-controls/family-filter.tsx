"use client";

import { useMemo } from "react";
import type { FilterOption } from "@/components/reports/report-filters";
import { FilterSelect } from "./filter-select";

interface FamilyFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de família, alinhado ao design system da F1. */
export function FamilyFilter({ value, onChange, options }: FamilyFilterProps) {
  const opcoes = useMemo(
    () => [
      { value: "", label: "Todas as famílias" },
      ...options.map((o) => ({ value: String(o.id), label: o.nome })),
    ],
    [options],
  );

  return (
    <FilterSelect
      id="filtro-familia"
      label="Família"
      value={value}
      options={opcoes}
      onChange={onChange}
    />
  );
}
