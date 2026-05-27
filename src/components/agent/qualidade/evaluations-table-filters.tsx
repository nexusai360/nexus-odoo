"use client";

/**
 * EvaluationsTableFilters , barra de filtros sticky abaixo do header da
 * tabela. Search livre (pergunta+resposta), status multi-select via
 * dropdown com checkboxes (tags coloridas como preview), pattern
 * single-select dropdown, modelo single-select, botao "Limpar" que
 * reseta TUDO.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

// Cores das tags por status. Quando inativa (estado base), o texto fica
// cinza/muted (parece "apagada"); quando ativa, ganha a cor semantica
// com background sutil. Padrao alinhado aos badges das KPIs.
const STATUS_TAG_ACTIVE: Record<EvalStatus, string> = {
  CORRETO:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  PARCIAL:
    "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-300",
  ERRADO:
    "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-300",
  FORA_DO_ESCOPO:
    "bg-slate-500/15 text-slate-700 border-slate-500/40 dark:text-slate-300",
  PENDENTE:
    "bg-sky-500/15 text-sky-700 border-sky-500/40 dark:text-sky-300",
  FALHA_TECNICA:
    "bg-violet-500/15 text-violet-700 border-violet-500/40 dark:text-violet-300",
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

// Estado "tudo padrao" para detectar se ha algum filtro ativo (para o
// "Limpar" aparecer).
const DEFAULT_VALUE: EvaluationsTableFiltersValue = {
  search: "",
  status: [],
  model: "all",
  pattern: "all",
};

function hasAnyFilter(v: EvaluationsTableFiltersValue): boolean {
  return (
    v.search !== "" ||
    v.status.length > 0 ||
    v.model !== "all" ||
    v.pattern !== "all"
  );
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

  const clearAll = () => {
    setSearchLocal("");
    onChange(DEFAULT_VALUE);
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

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <StatusMultiSelect
          selected={value.status}
          onToggle={toggleStatus}
          onClear={() => onChange({ ...value, status: [] })}
        />
        <CustomSelect
          value={value.model}
          onChange={(v) => onChange({ ...value, model: v })}
          triggerClassName="min-h-[36px] h-9 min-w-[160px]"
          aria-label="Modelo do agente"
          options={[
            { value: "all", label: "Todos os modelos" },
            ...availableModels.map((m) => ({ value: m, label: m })),
          ]}
        />
        <CustomSelect
          value={value.pattern}
          onChange={(v) => onChange({ ...value, pattern: v })}
          triggerClassName="min-h-[36px] h-9 min-w-[180px]"
          aria-label="Padrão diagnóstico"
          options={[
            { value: "all", label: "Todos os padrões" },
            ...availablePatterns.map((p) => ({ value: p, label: p })),
          ]}
        />
        {hasAnyFilter(value) && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Limpar todos os filtros"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * StatusMultiSelect , dropdown com checkboxes. Cada linha mostra a tag
 * colorida do status (apagada quando nao selecionado, acesa quando
 * selecionado). Filtro e aplicado instantaneamente a cada clique no
 * checkbox; o popover continua aberto pra multipla selecao. Label do
 * gatilho mostra "Status" (vazio) ou "N selecionados".
 */
function StatusMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: EvalStatus[];
  onToggle: (s: EvalStatus) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerLabel =
    selected.length === 0
      ? "Status"
      : selected.length === 1
        ? STATUS_LABEL[selected[0]]
        : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-label="Filtrar por status"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[170px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={4}
        className="min-w-[220px] w-auto overflow-hidden p-1"
      >
        <ul role="listbox" aria-label="Status" className="flex flex-col">
          {STATUS_ORDER.map((s) => {
            const isOn = selected.includes(s);
            return (
              <li key={s} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isOn}
                  onClick={() => onToggle(s)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors",
                      isOn && "border-violet-500 bg-violet-500 text-white",
                    )}
                    aria-hidden
                  >
                    {isOn ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                      isOn
                        ? STATUS_TAG_ACTIVE[s]
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={onClear}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
