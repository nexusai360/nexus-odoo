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
  // OpenAI
  { provider: "openai", pattern: /^gpt-5(\.[\w-]+)?(-\d{8})?$/ },
  { provider: "openai", pattern: /^gpt-4\.1(-mini|-nano)?$/ },
  { provider: "openai", pattern: /^gpt-4o(-mini)?(-realtime(-preview)?)?(-\d{4}-\d{2}-\d{2})?$/ },
  { provider: "openai", pattern: /^gpt-4o-(mini-)?(transcribe|tts)$/ },
  { provider: "openai", pattern: /^o[1-9](-pro|-mini)?$/ },
  { provider: "openai", pattern: /^text-embedding-3-(small|large)$/ },
  { provider: "openai", pattern: /^whisper-1$/ },
  { provider: "openai", pattern: /^tts-1(-hd)?$/ },

  // Anthropic
  { provider: "anthropic", pattern: /^claude-(opus|sonnet|haiku)-4(-\d+)?(-\d{8})?$/ },
  { provider: "anthropic", pattern: /^claude-3-(5|7)-(sonnet|opus|haiku)(-[\w-]+)?$/ },

  // Gemini
  { provider: "gemini", pattern: /^gemini-(1\.5|2\.0|2\.5|3\.[\w-]+)-(pro|flash|flash-lite|flash-8b)(-thinking)?(-[\w-]+)?$/ },

  // OpenRouter — padrões por sub-família.
  { provider: "openrouter", pattern: /^openai\/(gpt-(5|5\.[\w-]+|4o|4\.[\w-]+)|o[1-9])(-[\w./-]+)?$/ },
  { provider: "openrouter", pattern: /^anthropic\/claude-(opus|sonnet|haiku)-[34]([.-][\w./-]+)?$/ },
  { provider: "openrouter", pattern: /^anthropic\/claude-3\.(5|7)-(sonnet|haiku|opus)(:[\w-]+)?$/ },
  { provider: "openrouter", pattern: /^google\/gemini-(1\.5|2\.0|2\.5)[\w./-]*(:free)?$/ },
  { provider: "openrouter", pattern: /^google\/gemma-[\w.-]+(:free)?$/ },
  { provider: "openrouter", pattern: /^deepseek\/deepseek-(chat|coder|r1|v[234])([\w./-]+)?(:free)?$/ },
  { provider: "openrouter", pattern: /^meta-llama\/llama-(3\.3|4)([\w./-]+)?(:free)?$/ },
  { provider: "openrouter", pattern: /^mistralai\/(mistral|codestral|mixtral)[\w.-]+(:free)?$/ },
  { provider: "openrouter", pattern: /^qwen\/qwen[\w.-]+(:free)?$/ },
  { provider: "openrouter", pattern: /^qwen\/qwq[\w.-]*(:free)?$/ },
  { provider: "openrouter", pattern: /^x-ai\/grok-[34]([\w./-]+)?$/ },
  { provider: "openrouter", pattern: /^cohere\/command-[\w.-]+$/ },
  { provider: "openrouter", pattern: /^perplexity\/sonar([\w.-]*)?$/ },
  { provider: "openrouter", pattern: /^microsoft\/phi-[34][\w.-]*$/ },
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
