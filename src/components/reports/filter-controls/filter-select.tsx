"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterSelectOption {
  value: string;
  label: string;
  /** Rótulo do grupo — opções com mesmo grupo ficam agrupadas. */
  group?: string;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Ativa busca interna no popup. Ativada automaticamente quando
   * `options.length >= searchThreshold` (padrão 8, excluindo a opção "Todos").
   */
  searchable?: boolean;
  searchThreshold?: number;
}

/**
 * Select de filtro alinhado ao design system:
 * - `side="bottom"` garantido via prop explícita no SelectContent
 * - largura mínima de 200px no trigger para nomes legíveis
 * - busca interna quando a lista é longa (≥ searchThreshold itens)
 * - agrupamento opcional via `group` em cada opção
 */
export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  searchable,
  searchThreshold = 8,
}: FilterSelectProps) {
  const [query, setQuery] = useState("");

  // Determina se mostra busca: prop explícita OU lista grande
  const showSearch =
    searchable ?? options.filter((o) => o.value !== "").length >= searchThreshold;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Opções sem valor (ex.: "Todos os armazéns") sempre aparecem
    return options.filter(
      (o) => o.value === "" || o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Agrupa as opções pelo campo `group`; opções sem grupo ficam em lista plana
  const grouped = useMemo(() => {
    const hasGroups = filtered.some((o) => o.group);
    if (!hasGroups) return null;

    const map = new Map<string, FilterSelectOption[]>();
    for (const o of filtered) {
      const key = o.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={options}
        value={value}
        onValueChange={(v) => onChange(String(v ?? ""))}
      >
        <SelectTrigger
          id={id}
          className="min-w-[200px] max-w-xs w-full"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          side="bottom"
          className="min-w-[200px]"
        >
          {/* Busca interna — não é um item selecionável */}
          {showSearch && (
            <div className="px-2 py-1.5 sticky top-0 bg-popover z-10 border-b border-border/50">
              <div className="relative">
                <Search
                  className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Buscar…"
                  className="h-7 pl-7 text-xs"
                  aria-label={`Buscar ${label.toLowerCase()}`}
                />
              </div>
            </div>
          )}

          {grouped
            ? Array.from(grouped.entries()).map(([groupName, items]) =>
                groupName ? (
                  <SelectGroup key={groupName}>
                    <SelectLabel>{groupName}</SelectLabel>
                    {items.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  items.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))
                ),
              )
            : filtered.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}

          {filtered.length === 0 && (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Nenhum resultado
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
