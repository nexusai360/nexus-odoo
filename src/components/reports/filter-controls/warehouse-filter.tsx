"use client";

import type { FilterOption } from "./product-filter";

interface WarehouseFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de armazém: select nativo com opção "Todos". */
export function WarehouseFilter({ value, onChange, options }: WarehouseFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
    >
      <option value="">Todos os armazéns</option>
      {options.map((o) => (
        <option key={o.id} value={String(o.id)}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}
