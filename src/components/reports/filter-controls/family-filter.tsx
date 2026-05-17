"use client";

import type { FilterOption } from "./product-filter";

interface FamilyFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de família: select nativo com opção "Todas". */
export function FamilyFilter({ value, onChange, options }: FamilyFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
    >
      <option value="">Todas as famílias</option>
      {options.map((o) => (
        <option key={o.id} value={String(o.id)}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}
