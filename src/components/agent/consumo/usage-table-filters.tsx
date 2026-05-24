"use client";

/**
 * UsageTableFilters , filtros cascade de provider e modelo para a tabela de uso.
 *
 * Clone do `usage-table-filters.tsx` do nexus-insights: dois selects em
 * popover, botão "Limpar filtros", sufixo de provider nos modelos quando
 * nenhum provider está ativo, cascade provider→modelo.
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { providerLabel } from "@/lib/agent/llm/provider-labels";
import { cn } from "@/lib/utils";

export interface UsageTableFiltersProps {
  /** Lista de providers distintos no período. */
  providers: string[];
  /** Mapa provider → modelos disponíveis no período. */
  modelsByProvider: Record<string, string[]>;
  /** Provider ativo. `undefined` = "Todos os provedores". */
  selectedProvider?: string;
  /** Modelo ativo. `undefined` = "Todos os modelos". */
  selectedModel?: string;
  onProviderChange: (provider: string | undefined) => void;
  onModelChange: (model: string | undefined) => void;
}

interface ModelOption {
  value: string;
  label: string;
  provider?: string;
}

export function UsageTableFilters({
  providers,
  modelsByProvider,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: UsageTableFiltersProps) {
  const hasActiveFilter =
    selectedProvider !== undefined || selectedModel !== undefined;

  // Lista de modelos (cascade ou flat com sufixo de provider).
  const modelOptions: ModelOption[] = useMemo(() => {
    if (selectedProvider) {
      const list = modelsByProvider[selectedProvider] ?? [];
      return list.map((m) => ({ value: m, label: m }));
    }
    const flat: ModelOption[] = [];
    for (const provider of providers) {
      const models = modelsByProvider[provider] ?? [];
      for (const m of models) {
        flat.push({ value: m, label: m, provider });
      }
    }
    return flat;
  }, [providers, modelsByProvider, selectedProvider]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {hasActiveFilter ? (
        <button
          type="button"
          onClick={() => {
            onProviderChange(undefined);
            onModelChange(undefined);
          }}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Limpar filtros"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpar filtros
        </button>
      ) : null}

      <ProviderSelect
        providers={providers}
        selectedProvider={selectedProvider}
        onChange={(next) => {
          onProviderChange(next);
          // Reset cascade: provider mudou → modelo deixa de fazer sentido.
          onModelChange(undefined);
        }}
      />

      <ModelSelect
        options={modelOptions}
        selectedModel={selectedModel}
        showProviderSuffix={!selectedProvider}
        onChange={onModelChange}
      />
    </div>
  );
}

interface ProviderSelectProps {
  providers: string[];
  selectedProvider?: string;
  onChange: (provider: string | undefined) => void;
}

function ProviderSelect({
  providers,
  selectedProvider,
  onChange,
}: ProviderSelectProps) {
  const [open, setOpen] = useState(false);
  const label =
    selectedProvider !== undefined
      ? providerLabel(selectedProvider)
      : "Todos os provedores";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por provedor"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{label}</span>
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
        align="end"
        sideOffset={4}
        className="min-w-[200px] w-auto overflow-hidden p-0"
      >
        <ul
          role="listbox"
          aria-label="Provedores"
          className="flex flex-col py-1"
        >
          <SelectOption
            label="Todos os provedores"
            selected={selectedProvider === undefined}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          />
          {providers.map((p) => (
            <SelectOption
              key={p}
              label={providerLabel(p)}
              selected={selectedProvider === p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface ModelSelectProps {
  options: ModelOption[];
  selectedModel?: string;
  showProviderSuffix: boolean;
  onChange: (model: string | undefined) => void;
}

function ModelSelect({
  options,
  selectedModel,
  showProviderSuffix,
  onChange,
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const label = selectedModel ?? "Todos os modelos";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por modelo"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{label}</span>
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
        align="end"
        sideOffset={4}
        className="min-w-[240px] w-auto max-w-[min(calc(100vw-2rem),360px)] overflow-hidden p-0"
      >
        <ul
          role="listbox"
          aria-label="Modelos"
          className="flex max-h-72 flex-col overflow-y-auto py-1"
        >
          <SelectOption
            label="Todos os modelos"
            selected={selectedModel === undefined}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          />
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Sem modelos disponíveis
            </li>
          ) : (
            options.map((opt) => {
              const displayLabel =
                showProviderSuffix && opt.provider
                  ? `${opt.label} (${providerLabel(opt.provider)})`
                  : opt.label;
              return (
                <SelectOption
                  key={`${opt.provider ?? ""}::${opt.value}`}
                  label={displayLabel}
                  selected={selectedModel === opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                />
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface SelectOptionProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function SelectOption({ label, selected, onClick }: SelectOptionProps) {
  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
          selected && "bg-accent/50",
        )}
      >
        <span className="truncate">{label}</span>
        {selected ? (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
        ) : null}
      </button>
    </li>
  );
}
