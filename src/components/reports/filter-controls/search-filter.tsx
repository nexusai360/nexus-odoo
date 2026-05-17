"use client";

import { Input } from "@/components/ui/input";

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/** Filtro de busca textual livre. */
export function SearchFilter({ value, onChange }: SearchFilterProps) {
  return (
    <Input
      placeholder="Pesquisar…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-xs"
    />
  );
}
