"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export interface FilterOption {
  id: number;
  nome: string;
}

interface ProductFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

/** Filtro de produto: campo de busca + lista filtrada de opções. */
export function ProductFilter({ value, onChange, options }: ProductFilterProps) {
  const [query, setQuery] = useState("");
  const selecionado = options.find((o) => String(o.id) === value);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o) => o.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [query, options]);

  return (
    <div className="flex flex-col gap-1">
      <Input
        placeholder="Buscar produto…"
        value={query || selecionado?.nome || ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value) onChange("");
        }}
        className="max-w-xs"
      />
      {filtradas.length > 0 && (
        <ul className="rounded-md ring-1 ring-foreground/10 bg-card text-sm">
          {filtradas.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  onChange(String(o.id));
                  setQuery("");
                }}
              >
                {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
