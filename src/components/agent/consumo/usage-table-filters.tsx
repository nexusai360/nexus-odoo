"use client";

/**
 * UsageTableFilters — filtros cascade de provider e modelo para a tabela de uso.
 *
 * Task 5.2c (Onda 5, F5).
 * Portado de nexus-insights/src/components/llm/usage-table-filters.tsx.
 * Quando provider muda, reseta o modelo (cascade).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 */

import { CustomSelect } from "@/components/ui/custom-select";

interface UsageTableFiltersProps {
  providers: string[];
  modelsByProvider: Record<string, string[]>;
  selectedProvider: string | undefined;
  selectedModel: string | undefined;
  onProviderChange: (provider: string | undefined) => void;
  onModelChange: (model: string | undefined) => void;
}

const ALL = "__all__";

function providerLabel(key: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    openrouter: "OpenRouter",
  };
  return labels[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

export function UsageTableFilters({
  providers,
  modelsByProvider,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: UsageTableFiltersProps) {
  const availableModels = selectedProvider
    ? (modelsByProvider[selectedProvider] ?? [])
    : Object.values(modelsByProvider).flat();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filtro de provider */}
      <CustomSelect
        aria-label="Filtrar por provedor"
        value={selectedProvider ?? ALL}
        onChange={(v) => {
          onProviderChange(v === ALL ? undefined : v);
          onModelChange(undefined); // cascade reset
        }}
        triggerClassName="h-9 min-w-[200px]"
        options={[
          { value: ALL, label: "Todos os provedores" },
          ...providers.map((p) => ({ value: p, label: providerLabel(p) })),
        ]}
      />

      {/* Filtro de modelo (cascade) */}
      {availableModels.length > 0 && (
        <CustomSelect
          aria-label="Filtrar por modelo"
          value={selectedModel ?? ALL}
          onChange={(v) => onModelChange(v === ALL ? undefined : v)}
          triggerClassName="h-9 min-w-[200px]"
          options={[
            { value: ALL, label: "Todos os modelos" },
            ...availableModels.map((m) => ({ value: m, label: m })),
          ]}
        />
      )}
    </div>
  );
}
