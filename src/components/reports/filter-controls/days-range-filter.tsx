"use client";

import { FilterSelect } from "./filter-select";

interface DaysRangeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

const OPCOES = [
  { value: "30", label: "+30 dias" },
  { value: "60", label: "+60 dias" },
  { value: "90", label: "+90 dias" },
];

/** Filtro de faixa de dias parado: +30 / +60 / +90 dias. */
export function DaysRangeFilter({ value, onChange }: DaysRangeFilterProps) {
  return (
    <FilterSelect
      id="filtro-faixa-dias"
      label="Faixa de dias parado"
      value={value}
      options={OPCOES}
      onChange={onChange}
    />
  );
}
