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

interface UsageTableFiltersProps {
  providers: string[];
  modelsByProvider: Record<string, string[]>;
  selectedProvider: string | undefined;
  selectedModel: string | undefined;
  onProviderChange: (provider: string | undefined) => void;
  onModelChange: (model: string | undefined) => void;
}

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
      <select
        value={selectedProvider ?? "__all__"}
        onChange={(e) => {
          const v = e.target.value;
          onProviderChange(v === "__all__" ? undefined : v);
          onModelChange(undefined); // cascade reset
        }}
        className="h-8 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs text-foreground transition-colors focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500"
        aria-label="Filtrar por provider"
      >
        <option value="__all__">Todos os providers</option>
        {providers.map((p) => (
          <option key={p} value={p}>{providerLabel(p)}</option>
        ))}
      </select>

      {/* Filtro de modelo (cascade) */}
      {availableModels.length > 0 && (
        <select
          value={selectedModel ?? "__all__"}
          onChange={(e) => {
            const v = e.target.value;
            onModelChange(v === "__all__" ? undefined : v);
          }}
          className="h-8 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs text-foreground transition-colors focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Filtrar por modelo"
        >
          <option value="__all__">Todos os modelos</option>
          {availableModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
    </div>
  );
}
