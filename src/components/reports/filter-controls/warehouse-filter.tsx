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

const TIPO_LABEL: Record<string, string> = {
  proprio: "Armazéns próprios",
  demonstracao: "Demonstração",
  virtual: "Virtual",
  outros: "Outros",
};

/**
 * Filtro de armazém com:
 * - Nomes limpos via `limparNomeLocal`
 * - Busca interna automática (lista tende a ser longa)
 * - Agrupamento por tipo de local (próprio / demonstração / virtual / outros)
 */
export function WarehouseFilter({ value, onChange, options }: WarehouseFilterProps) {
  const opcoes = useMemo(() => {
    const itens = options.map((o) => {
      const { rotulo, tipo } = limparNomeLocal(o.nome);
      return {
        value: String(o.id),
        label: rotulo,
        group: TIPO_LABEL[tipo] ?? "Outros",
      };
    });

    return [
      { value: "", label: "Todos os armazéns" },
      ...itens,
    ];
  }, [options]);

  return (
    <FilterSelect
      id="filtro-armazem"
      label="Armazém"
      value={value}
      options={opcoes}
      onChange={onChange}
      searchable
    />
  );
}
