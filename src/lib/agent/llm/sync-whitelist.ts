// Whitelist de modelos aceitos no sync de catalogo, por provedor.
// Padrao: regex contra modelId retornado pelo provider. Sem match = ignora.
//
// Regra de raiz: aceitar apenas modelos da geracao atual (lancados a partir
// de 2024-01-01) e relevantes para o produto. Snapshots datados (-yyyymmdd)
// sao permitidos quando o modelo base estiver na whitelist.

import type { LlmProvider } from "./types";

export interface WhitelistEntry {
  provider: LlmProvider;
  pattern: RegExp;
}

export const SYNC_WHITELIST: WhitelistEntry[] = [
  // OpenAI: GPT-5.x, GPT-4o (incluindo mini), embeddings 3, whisper, tts.
  { provider: "openai", pattern: /^gpt-5(\.[\w-]+)?(-\d{8})?$/ },
  { provider: "openai", pattern: /^gpt-4o(-mini)?(-realtime(-preview)?)?(-\d{4}-\d{2}-\d{2})?$/ },
  { provider: "openai", pattern: /^gpt-4o-(mini-)?(transcribe|tts)$/ },
  { provider: "openai", pattern: /^text-embedding-3-(small|large)$/ },
  { provider: "openai", pattern: /^whisper-1$/ },
  { provider: "openai", pattern: /^tts-1(-hd)?$/ },

  // Anthropic: Claude 4.x (opus/sonnet/haiku) e Claude 3.5/3.7.
  { provider: "anthropic", pattern: /^claude-(opus|sonnet|haiku)-4(-\d+)?(-\d{8})?$/ },
  { provider: "anthropic", pattern: /^claude-3-(5|7)-(sonnet|opus|haiku)(-[\w-]+)?$/ },

  // Google: Gemini 2.x.
  { provider: "gemini", pattern: /^gemini-2\.[\w-]+$/ },

  // OpenRouter: agrega multiplos provedores; aceitamos sufixos conhecidos das
  // familias acima (o id vem como "openai/gpt-4o-mini", etc.).
  { provider: "openrouter", pattern: /^openai\/gpt-(5|4o)[\w./-]*$/ },
  { provider: "openrouter", pattern: /^anthropic\/claude-(opus|sonnet|haiku|3)[\w./-]*$/ },
  { provider: "openrouter", pattern: /^google\/gemini-2[\w./-]*$/ },
];

export function isAllowedByWhitelist(
  provider: LlmProvider,
  modelId: string,
): boolean {
  for (const entry of SYNC_WHITELIST) {
    if (entry.provider !== provider) continue;
    if (entry.pattern.test(modelId)) return true;
  }
  return false;
}
