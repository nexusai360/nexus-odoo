"use client";

import { FilterSelect } from "./filter-select";

interface DirectionFilterProps {
  value: string;
  onChange: (value: string) => void;
}

const OPCOES = [
  { value: "", label: "Todos os sentidos" },
  { value: "entrada", label: "Entradas" },
  { value: "saida", label: "Saídas" },
];

/** Filtro de sentido do movimento. */
export function DirectionFilter({ value, onChange }: DirectionFilterProps) {
  return (
    <FilterSelect
      id="filtro-sentido"
      label="Sentido"
      value={value}
      options={OPCOES}
      onChange={onChange}
    />
  );
}
