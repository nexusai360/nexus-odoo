import { cn } from "@/lib/utils";

/**
 * ProviderBadge — chip neutro indicando o provedor de origem do modelo.
 *
 * Usado principalmente em entries do OpenRouter (que agrega múltiplos
 * provedores num único catálogo): mostra a procedência (OpenAI, Anthropic,
 * Google, DeepSeek, Meta, etc.) ao lado da TierBadge de custo.
 */

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  "meta-llama": "Meta",
  meta: "Meta",
  qwen: "Qwen",
  mistralai: "Mistral",
  mistral: "Mistral",
  cohere: "Cohere",
  "x-ai": "xAI",
  xai: "xAI",
  microsoft: "Microsoft",
  perplexity: "Perplexity",
  gemma: "Google",
  llama: "Meta",
};

/** Extrai a chave de provedor a partir de um id no padrão `vendor/model`. */
export function providerKeyFromModelId(id: string): string | null {
  const idx = id.indexOf("/");
  if (idx <= 0) return null;
  return id.slice(0, idx).toLowerCase();
}

/** Rótulo humanizado do provedor; fallback capitaliza o slug. */
export function providerLabel(key: string): string {
  return PROVIDER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function ProviderBadge({
  providerKey,
  className,
}: {
  providerKey: string;
  className?: string;
}) {
  const label = providerLabel(providerKey);
  return (
    <span
      title={`Provedor: ${label}`}
      aria-label={`Provedor ${label}`}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-zinc-500/30 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300",
        className,
      )}
    >
      {label}
    </span>
  );
}
