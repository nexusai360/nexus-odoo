"use client";

/**
 * EvaluationsTableFilters , barra de filtros sticky abaixo do header da
 * tabela. Search livre (pergunta+resposta), status multi-select via chips,
 * pattern multi-select dropdown, modelo single-select.
 */

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import type { EvalStatus } from "@/lib/agent/quality/queries";

const STATUS_LABEL: Record<EvalStatus, string> = {
  CORRETO: "Corretos",
  PARCIAL: "Parciais",
  ERRADO: "Errados",
  FORA_DO_ESCOPO: "Fora de escopo",
  PENDENTE: "Pendentes",
  FALHA_TECNICA: "Falhas técnicas",
};

const STATUS_CHIP: Record<EvalStatus, string> = {
  CORRETO:
    "data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-700 data-[active=true]:border-emerald-500/40 dark:data-[active=true]:text-emerald-300",
  PARCIAL:
    "data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-700 data-[active=true]:border-amber-500/40 dark:data-[active=true]:text-amber-300",
  ERRADO:
    "data-[active=true]:bg-red-500/15 data-[active=true]:text-red-700 data-[active=true]:border-red-500/40 dark:data-[active=true]:text-red-300",
  FORA_DO_ESCOPO:
    "data-[active=true]:bg-slate-500/15 data-[active=true]:text-slate-700 data-[active=true]:border-slate-500/40 dark:data-[active=true]:text-slate-300",
  PENDENTE:
    "data-[active=true]:bg-sky-500/15 data-[active=true]:text-sky-700 data-[active=true]:border-sky-500/40 dark:data-[active=true]:text-sky-300",
  FALHA_TECNICA:
    "data-[active=true]:bg-violet-500/15 data-[active=true]:text-violet-700 data-[active=true]:border-violet-500/40 dark:data-[active=true]:text-violet-300",
};

const STATUS_ORDER: EvalStatus[] = [
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "PENDENTE",
  "FALHA_TECNICA",
];

export interface EvaluationsTableFiltersValue {
  search: string;
  status: EvalStatus[];
  model: string; // "all" ou modelo específico
  pattern: string; // "all" ou pattern específico
}

interface Props {
  value: EvaluationsTableFiltersValue;
  onChange: (next: EvaluationsTableFiltersValue) => void;
  availableModels: string[];
  availablePatterns: string[];
}

export function EvaluationsTableFilters({
  value,
  onChange,
  availableModels,
  availablePatterns,
}: Props) {
  // search local com debounce de 250ms para não disparar a cada tecla.
  const [searchLocal, setSearchLocal] = useState(value.search);
  useEffect(() => setSearchLocal(value.search), [value.search]);
  useEffect(() => {
    if (searchLocal === value.search) return;
    const t = setTimeout(
      () => onChange({ ...value, search: searchLocal.trim() }),
      250,
    );
    return () => clearTimeout(t);
  }, [searchLocal, value, onChange]);

  const toggleStatus = (s: EvalStatus) => {
    const next = value.status.includes(s)
      ? value.status.filter((x) => x !== s)
      : [...value.status, s];
    onChange({ ...value, status: next });
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 lg:flex-row lg:items-center">
      <div className="relative flex-1 lg:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar em pergunta ou resposta…"
          value={searchLocal}
          onChange={(e) => setSearchLocal(e.target.value)}
          className="pl-8"
          aria-label="Buscar em pergunta ou resposta"
        />
      </div>

      <div
        role="group"
        aria-label="Filtrar por status"
        className="flex flex-wrap items-center gap-1.5"
      >
        {STATUS_ORDER.map((s) => {
          const active = value.status.includes(s);
          return (
            <button
              type="button"
              key={s}
              onClick={() => toggleStatus(s)}
              data-active={active}
              aria-pressed={active}
              className={cn(
                "cursor-pointer rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                STATUS_CHIP[s],
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
        {value.status.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, status: [] })}
            className="ml-1 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Limpar filtro de status"
          >
            limpar
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <CustomSelect
          value={value.model}
          onChange={(v) => onChange({ ...value, model: v })}
          triggerClassName="min-w-[160px]"
          aria-label="Modelo do agente"
          options={[
            { value: "all", label: "Todos os modelos" },
            ...availableModels.map((m) => ({ value: m, label: m })),
          ]}
        />
        <CustomSelect
          value={value.pattern}
          onChange={(v) => onChange({ ...value, pattern: v })}
          triggerClassName="min-w-[180px]"
          aria-label="Padrão diagnóstico"
          options={[
            { value: "all", label: "Todos os padrões" },
            ...availablePatterns.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>

      {value.status.length > 0 && (
        <div className="hidden gap-1 lg:flex">
          {value.status.map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {STATUS_LABEL[s]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
