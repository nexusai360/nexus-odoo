/**
 * Rótulos de exibição dos providers de LLM.
 *
 * Portado do nexus-insights (`lib/llm/pricing.ts`, só a parte de rótulos) para
 * a tela de consumo do Agente Nex.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  google: "Google",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
};

/** Rótulo amigável de um provider; capitaliza a chave se desconhecida. */
export function providerLabel(key: string): string {
  return PROVIDER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
