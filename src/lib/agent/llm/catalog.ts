/**
 * Catálogo+pricing unificado de provedores e modelos LLM.
 *
 * Fonte única: cada entrada em `MODELS` carrega id, provider, tier, label e
 * pricing inline. Isso elimina o descasamento de IDs entre catálogo e tabela
 * de preços separada (BUG 2 e BUG 3 do nexus-insights).
 *
 * `pricing: null` = modelo sem preço conhecido → `calculateCost` retorna
 * `costKnown: false` em vez de 0 silencioso.
 *
 * Portado e corrigido de nexus-insights/src/lib/llm/{catalog,pricing}.ts (F5).
 * Atualizado em maio/2026 (cutoff).
 */

import type { LlmProvider, CostTier } from "./types";

export type { LlmProvider, CostTier };

export interface ModelPricing {
  /** Custo de tokens de input em USD por 1.000.000 de tokens. */
  inputPerMTok: number;
  /** Custo de tokens de output em USD por 1.000.000 de tokens. */
  outputPerMTok: number;
  /** Custo em USD/minuto de áudio (modelos de transcrição). */
  perMinuteUsd?: number;
}

/** Para que serve o modelo , usado na linha de descrição do select. */
export type ModelUse =
  | "conversação"
  | "código"
  | "áudio"
  | "raciocínio"
  | "raciocínio profundo"
  | "busca"
  | "embedding";

/** Níveis de esforço de raciocínio (thinking), do menor ao maior. */
/**
 * @deprecated Use ReasoningEffort de `./types`. Mantido por compat na
 * transição da Onda 1 do plano de modernização dos adapters.
 * Inclui "auto" para modelos com adaptive nativo (Anthropic, Gemini 3.x).
 */
export type ReasoningLevel = "auto" | "minimal" | "low" | "medium" | "high";

export interface ModelEntry {
  id: string;
  provider: LlmProvider;
  label: string;
  tier: CostTier;
  notes?: string;
  released?: string;
  /** null = preço desconhecido; calculateCost devolve costKnown=false. */
  pricing: ModelPricing | null;
  /** Para que serve (default "conversação"). */
  use?: ModelUse;
  /** Entende áudio (transcrição de voz). */
  audio?: boolean;
  /** Entende imagem (visão multimodal). */
  vision?: boolean;
  /**
   * Suporte a modo raciocínio (thinking). Ausente = não suporta.
   * `levels` traz os níveis de esforço aceitos, do menor ao maior.
   */
  reasoning?: { levels: ReasoningLevel[] };
  /** true quando o modelo veio do banco e foi marcado como deprecated_at. */
  deprecated?: boolean;
}

export interface ProviderMeta {
  provider: LlmProvider;
  label: string;
  apiKeyUrl: string;
  topUpUrl?: string;
  allowCustomModel: boolean;
}

export const PROVIDER_META: Record<LlmProvider, ProviderMeta> = {
  openai: {
    provider: "openai",
    label: "OpenAI",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    topUpUrl: "https://platform.openai.com/account/billing",
    allowCustomModel: true,
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    topUpUrl: "https://console.anthropic.com/settings/billing",
    allowCustomModel: true,
  },
  gemini: {
    provider: "gemini",
    label: "Gemini",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    topUpUrl: "https://console.cloud.google.com/billing",
    allowCustomModel: true,
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    topUpUrl: "https://openrouter.ai/credits",
    allowCustomModel: true,
  },
};

// ─── OpenAI ──────────────────────────────────────────────────────────────────
const OPENAI: ModelEntry[] = [
  { id: "gpt-5.5",             provider: "openai", label: "GPT-5.5",          tier: "high",    notes: "$5/$30",       released: "2026-04", pricing: { inputPerMTok: 5.0,   outputPerMTok: 30.0  }, vision: true },
  { id: "gpt-5.5-pro",         provider: "openai", label: "GPT-5.5 Pro",      tier: "premium", notes: "$30/$180",     released: "2026-04", pricing: { inputPerMTok: 30.0,  outputPerMTok: 180.0 }, use: "raciocínio profundo", vision: true },
  { id: "gpt-5.4",             provider: "openai", label: "GPT-5.4",          tier: "high",    notes: "$2.5/$15",     released: "2026-04", pricing: { inputPerMTok: 2.5,   outputPerMTok: 15.0  }, vision: true },
  { id: "gpt-5.4-pro",         provider: "openai", label: "GPT-5.4 Pro",      tier: "premium", notes: "$30/$180",     released: "2026-04", pricing: { inputPerMTok: 30.0,  outputPerMTok: 180.0 }, use: "raciocínio profundo", vision: true },
  { id: "gpt-5.4-mini",        provider: "openai", label: "GPT-5.4 mini",     tier: "low",                            released: "2026-04", pricing: { inputPerMTok: 0.25,  outputPerMTok: 2.0   }, vision: true },
  { id: "gpt-5.4-nano",        provider: "openai", label: "GPT-5.4 nano",     tier: "low",                            released: "2026-04", pricing: { inputPerMTok: 0.05,  outputPerMTok: 0.4   }, vision: true },
  { id: "gpt-5.3-codex",       provider: "openai", label: "GPT-5.3 Codex",    tier: "high",    notes: "código",      released: "2026-03", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  }, use: "código", vision: true },
  { id: "gpt-5.2",             provider: "openai", label: "GPT-5.2",          tier: "high",                           released: "2026-03", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  }, vision: true },
  { id: "gpt-5.1",             provider: "openai", label: "GPT-5.1",          tier: "high",                           released: "2026-02", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  }, vision: true },
  { id: "gpt-5.1-codex-mini",  provider: "openai", label: "GPT-5.1 Codex mini", tier: "low",  notes: "código",       released: "2026-02", pricing: { inputPerMTok: 0.25,  outputPerMTok: 2.0   }, use: "código" },
  { id: "gpt-5",               provider: "openai", label: "GPT-5",            tier: "high",                           released: "2025-12", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  }, vision: true },
  { id: "gpt-5-codex",         provider: "openai", label: "GPT-5 Codex",      tier: "medium",  notes: "código",      released: "2025-12", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  }, use: "código", vision: true },
  { id: "gpt-5-mini",          provider: "openai", label: "GPT-5 mini",       tier: "medium",                         released: "2025-12", pricing: { inputPerMTok: 0.25,  outputPerMTok: 2.0   }, vision: true },
  { id: "gpt-5-nano",          provider: "openai", label: "GPT-5 nano",       tier: "low",                            released: "2025-12", pricing: { inputPerMTok: 0.05,  outputPerMTok: 0.4   }, vision: true },
  { id: "o3-pro",              provider: "openai", label: "o3-pro",            tier: "premium", notes: "raciocínio profundo", released: "2025-04", pricing: { inputPerMTok: 20.0,  outputPerMTok: 80.0  }, use: "raciocínio profundo" },
  { id: "o3",                  provider: "openai", label: "o3",                tier: "high",    notes: "raciocínio",  released: "2025-04", pricing: { inputPerMTok: 2.0,   outputPerMTok: 8.0   }, use: "raciocínio" },
  { id: "o1-pro",              provider: "openai", label: "o1-pro",            tier: "premium", notes: "raciocínio profundo", released: "2025-03", pricing: null, use: "raciocínio profundo" },
  { id: "o1",                  provider: "openai", label: "o1",                tier: "high",    notes: "raciocínio",  released: "2024-12", pricing: { inputPerMTok: 15.0,  outputPerMTok: 60.0  }, use: "raciocínio" },
  { id: "gpt-4.1",             provider: "openai", label: "GPT-4.1",          tier: "medium",                         released: "2025-04", pricing: { inputPerMTok: 2.0,   outputPerMTok: 8.0   }, vision: true },
  { id: "gpt-4.1-mini",        provider: "openai", label: "GPT-4.1 mini",     tier: "low",                            released: "2025-04", pricing: { inputPerMTok: 0.4,   outputPerMTok: 1.6   }, vision: true },
  { id: "gpt-4o",              provider: "openai", label: "GPT-4o",           tier: "medium",                         released: "2024-05", pricing: { inputPerMTok: 2.5,   outputPerMTok: 10.0  }, vision: true, audio: true },
  { id: "gpt-4o-mini",         provider: "openai", label: "GPT-4o mini",      tier: "low",                            released: "2024-07", pricing: { inputPerMTok: 0.15,  outputPerMTok: 0.6   }, vision: true, audio: true },
  // Áudio (transcrição) , mantido pelo seletor de audio nas configuracoes do agente.
  { id: "gpt-4o-transcribe",      provider: "openai", label: "GPT-4o Transcribe",      tier: "low", use: "áudio", audio: true, released: "2025-03", pricing: { inputPerMTok: 6.0, outputPerMTok: 10.0 } },
  { id: "gpt-4o-mini-transcribe", provider: "openai", label: "GPT-4o mini Transcribe", tier: "low", use: "áudio", audio: true, released: "2025-03", pricing: { inputPerMTok: 3.0, outputPerMTok: 5.0 } },
  { id: "whisper-1",           provider: "openai", label: "Whisper-1",        tier: "low",     use: "áudio", audio: true, released: "2022-09", pricing: { inputPerMTok: 0, outputPerMTok: 0, perMinuteUsd: 0.006 } },
  // Embedding (router de catalogo R1) , so cobra input, sem output. Fora do
  // seletor de modelo do chat (use="embedding" e' filtrado em listModels), mas
  // entra no catalogo para calculo de custo e graficos do menu de consumo.
  { id: "text-embedding-3-small", provider: "openai", label: "Text Embedding 3 Small", tier: "low", use: "embedding", released: "2024-01", pricing: { inputPerMTok: 0.02, outputPerMTok: 0 } },
  { id: "text-embedding-3-large", provider: "openai", label: "Text Embedding 3 Large", tier: "low", use: "embedding", released: "2024-01", pricing: { inputPerMTok: 0.13, outputPerMTok: 0 } },
];

// ─── Anthropic ────────────────────────────────────────────────────────────────
const ANTHROPIC: ModelEntry[] = [
  { id: "claude-opus-4-7",          provider: "anthropic", label: "Claude Opus 4.7",      tier: "high",    notes: "$5/$25",  released: "2026-04", pricing: { inputPerMTok: 5.0,  outputPerMTok: 25.0 }, vision: true },
  { id: "claude-sonnet-4-7",        provider: "anthropic", label: "Claude Sonnet 4.7",    tier: "medium",                    released: "2026-04", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 }, vision: true },
  { id: "claude-sonnet-4-6",        provider: "anthropic", label: "Claude Sonnet 4.6",    tier: "medium",                    released: "2026-01", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 }, vision: true },
  { id: "claude-haiku-4-5",         provider: "anthropic", label: "Claude Haiku 4.5",     tier: "low",                       released: "2025-10", pricing: { inputPerMTok: 1.0,  outputPerMTok: 5.0  }, vision: true },
  { id: "claude-opus-4-5",          provider: "anthropic", label: "Claude Opus 4.5",      tier: "high",                      released: "2025-09", pricing: { inputPerMTok: 15.0, outputPerMTok: 75.0 }, vision: true },
  { id: "claude-sonnet-4-5",        provider: "anthropic", label: "Claude Sonnet 4.5",    tier: "medium",                    released: "2025-09", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 }, vision: true },
  { id: "claude-3-5-sonnet-20241022", provider: "anthropic", label: "Claude 3.5 Sonnet", tier: "medium",                    released: "2024-10", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 }, vision: true },
  { id: "claude-3-5-haiku-20241022",  provider: "anthropic", label: "Claude 3.5 Haiku",  tier: "low",                       released: "2024-10", pricing: { inputPerMTok: 1.0,  outputPerMTok: 5.0  } },
  { id: "claude-3-opus-20240229",   provider: "anthropic", label: "Claude 3 Opus",        tier: "premium", notes: "legado",  released: "2024-02", pricing: { inputPerMTok: 15.0, outputPerMTok: 75.0 }, vision: true },
];

// ─── Gemini ───────────────────────────────────────────────────────────────────
const GEMINI: ModelEntry[] = [
  // Gemini 3.x , geracao mais nova (lancada no Google AI Studio em 2026).
  { id: "gemini-3-pro",          provider: "gemini", label: "Gemini 3 Pro",           tier: "high",   notes: "raciocínio profundo", released: "2026-05", pricing: { inputPerMTok: 2.0,  outputPerMTok: 12.0 }, use: "raciocínio profundo", vision: true, audio: true },
  { id: "gemini-3.5-flash",      provider: "gemini", label: "Gemini 3.5 Flash",       tier: "low",                                  released: "2026-05", pricing: { inputPerMTok: 0.35, outputPerMTok: 2.8  }, vision: true, audio: true },
  { id: "gemini-3.1-flash-lite", provider: "gemini", label: "Gemini 3.1 Flash-Lite",  tier: "low",                                  released: "2026-05", pricing: { inputPerMTok: 0.1,  outputPerMTok: 0.4  }, vision: true, audio: true },
  // Gemini 2.5 (geracao anterior).
  { id: "gemini-2.5-pro",        provider: "gemini", label: "Gemini 2.5 Pro",         tier: "high",                              released: "2025-09", pricing: { inputPerMTok: 1.25, outputPerMTok: 10.0 }, vision: true, audio: true },
  { id: "gemini-2.5-flash",      provider: "gemini", label: "Gemini 2.5 Flash",       tier: "low",                              released: "2025-09", pricing: { inputPerMTok: 0.3,  outputPerMTok: 2.5  }, vision: true, audio: true },
  { id: "gemini-2.5-flash-lite", provider: "gemini", label: "Gemini 2.5 Flash Lite",  tier: "low",                              released: "2025-09", pricing: { inputPerMTok: 0.1,  outputPerMTok: 0.4  }, vision: true, audio: true },
  { id: "gemini-2.5-flash-thinking", provider: "gemini", label: "Gemini 2.5 Flash (Thinking)", tier: "low",                    released: "2025-12", pricing: { inputPerMTok: 0.3,  outputPerMTok: 2.5  }, use: "raciocínio", vision: true },
  { id: "gemini-2.5-pro-thinking",   provider: "gemini", label: "Gemini 2.5 Pro (Thinking)",   tier: "high",                   released: "2025-12", pricing: { inputPerMTok: 1.25, outputPerMTok: 10.0 }, use: "raciocínio profundo", vision: true },
  { id: "gemini-2.0-pro",        provider: "gemini", label: "Gemini 2.0 Pro",         tier: "medium",                           released: "2025-02", pricing: { inputPerMTok: 1.25, outputPerMTok: 5.0  }, vision: true, audio: true },
  { id: "gemini-2.0-flash",      provider: "gemini", label: "Gemini 2.0 Flash",       tier: "low",                              released: "2024-12", pricing: { inputPerMTok: 0.075, outputPerMTok: 0.3 }, vision: true, audio: true },
  { id: "gemini-2.0-flash-lite", provider: "gemini", label: "Gemini 2.0 Flash Lite",  tier: "low",                              released: "2025-02", pricing: { inputPerMTok: 0.075, outputPerMTok: 0.3 }, vision: true },
  { id: "gemini-1.5-pro",        provider: "gemini", label: "Gemini 1.5 Pro",         tier: "medium",                           released: "2024-05", pricing: { inputPerMTok: 1.25, outputPerMTok: 5.0  }, vision: true, audio: true },
  { id: "gemini-1.5-flash",      provider: "gemini", label: "Gemini 1.5 Flash",       tier: "low",                              released: "2024-05", pricing: { inputPerMTok: 0.075, outputPerMTok: 0.3 }, vision: true, audio: true },
  { id: "gemini-1.5-flash-8b",   provider: "gemini", label: "Gemini 1.5 Flash-8B",   tier: "low",                              released: "2024-10", pricing: null, vision: true },
];

// ─── OpenRouter ───────────────────────────────────────────────────────────────
// Modelos sem preço oficial público → pricing: null (costKnown=false no logger)
const OPENROUTER: ModelEntry[] = [
  // FREE
  { id: "meta-llama/llama-3.3-70b-instruct:free",  provider: "openrouter", label: "Llama 3.3 70B (free)",        tier: "free", notes: "free",              released: "2024-12", pricing: null },
  { id: "google/gemini-2.0-flash-exp:free",          provider: "openrouter", label: "Gemini 2.0 Flash Exp (free)", tier: "free", notes: "free",              released: "2024-12", pricing: null },
  { id: "deepseek/deepseek-chat-v3:free",            provider: "openrouter", label: "DeepSeek V3 (free)",          tier: "free", notes: "free",              released: "2024-12", pricing: null },
  { id: "deepseek/deepseek-r1:free",                 provider: "openrouter", label: "DeepSeek R1 (free)",          tier: "low", notes: "free raciocínio",   released: "2025-01", pricing: null },
  { id: "deepseek/deepseek-r1-0528:free",            provider: "openrouter", label: "DeepSeek R1 0528 (free)",     tier: "free", notes: "free",              released: "2025-05", pricing: null },
  { id: "qwen/qwen-2.5-7b-instruct:free",            provider: "openrouter", label: "Qwen 2.5 7B (free)",          tier: "free", notes: "free",              released: "2024-09", pricing: null },
  { id: "qwen/qwq-32b:free",                         provider: "openrouter", label: "Qwen QwQ 32B (free)",         tier: "low", notes: "free raciocínio",   released: "2025-03", pricing: null },
  { id: "qwen/qwen3-235b-a22b:free",                 provider: "openrouter", label: "Qwen3 235B (free)",            tier: "free", notes: "free",              released: "2025-04", pricing: null },
  { id: "mistralai/mistral-7b-instruct:free",        provider: "openrouter", label: "Mistral 7B (free)",            tier: "free", notes: "free",              released: "2023-09", pricing: null },
  { id: "meta-llama/llama-4-maverick:free",          provider: "openrouter", label: "Llama 4 Maverick (free)",     tier: "free", notes: "free",              released: "2025-04", pricing: null },
  { id: "google/gemma-3-27b-it:free",                provider: "openrouter", label: "Gemma 3 27B (free)",           tier: "free", notes: "free",              released: "2025-03", pricing: null },
  // OpenAI via OpenRouter
  { id: "openai/gpt-4o-mini",         provider: "openrouter", label: "GPT-4o mini",    tier: "low",    released: "2024-07", pricing: { inputPerMTok: 0.15,  outputPerMTok: 0.6   } },
  { id: "openai/gpt-5-mini",          provider: "openrouter", label: "GPT-5 mini",     tier: "low",    released: "2025-08", pricing: { inputPerMTok: 0.25,  outputPerMTok: 2.0   } },
  { id: "openai/gpt-5.4-mini",        provider: "openrouter", label: "GPT-5.4 mini",   tier: "low",    released: "2026-02", pricing: { inputPerMTok: 0.25,  outputPerMTok: 2.0   } },
  { id: "openai/gpt-4o",              provider: "openrouter", label: "GPT-4o",          tier: "medium", released: "2024-05", pricing: { inputPerMTok: 2.5,   outputPerMTok: 10.0  } },
  { id: "openai/gpt-4.1",             provider: "openrouter", label: "GPT-4.1",         tier: "medium", released: "2025-04", pricing: { inputPerMTok: 2.0,   outputPerMTok: 8.0   } },
  { id: "openai/gpt-5",               provider: "openrouter", label: "GPT-5",           tier: "medium", released: "2025-08", pricing: { inputPerMTok: 1.25,  outputPerMTok: 10.0  } },
  { id: "openai/gpt-5.4",             provider: "openrouter", label: "GPT-5.4",         tier: "high",   released: "2026-02", pricing: { inputPerMTok: 2.5,   outputPerMTok: 15.0  } },
  { id: "openai/gpt-5.5",             provider: "openrouter", label: "GPT-5.5",         tier: "high",   released: "2026-04", pricing: { inputPerMTok: 5.0,   outputPerMTok: 30.0  } },
  { id: "openai/o1",                  provider: "openrouter", label: "o1",              tier: "high",   released: "2024-12", pricing: { inputPerMTok: 15.0,  outputPerMTok: 60.0  } },
  { id: "openai/o3",                  provider: "openrouter", label: "o3",              tier: "high",   released: "2025-04", pricing: { inputPerMTok: 2.0,   outputPerMTok: 8.0   } },
  { id: "openai/o3-mini",             provider: "openrouter", label: "o3-mini",         tier: "low",    released: "2025-01", pricing: null },
  { id: "openai/o4-mini",             provider: "openrouter", label: "o4-mini",         tier: "medium", released: "2025-04", pricing: null },
  { id: "openai/o3-pro",              provider: "openrouter", label: "o3-pro",          tier: "premium", released: "2025-06", pricing: null },
  // Anthropic via OpenRouter
  { id: "anthropic/claude-3.5-haiku",  provider: "openrouter", label: "Claude 3.5 Haiku",  tier: "low",    released: "2024-11", pricing: { inputPerMTok: 1.0,  outputPerMTok: 5.0  } },
  { id: "anthropic/claude-3.5-sonnet", provider: "openrouter", label: "Claude 3.5 Sonnet", tier: "medium", released: "2024-10", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "anthropic/claude-sonnet-4.5", provider: "openrouter", label: "Claude Sonnet 4.5", tier: "medium", released: "2025-09", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "anthropic/claude-sonnet-4.6", provider: "openrouter", label: "Claude Sonnet 4.6", tier: "medium", released: "2025-12", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "anthropic/claude-sonnet-4.7", provider: "openrouter", label: "Claude Sonnet 4.7", tier: "medium", released: "2026-03", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "anthropic/claude-opus-4.5",   provider: "openrouter", label: "Claude Opus 4.5",   tier: "high",   released: "2025-08", pricing: { inputPerMTok: 15.0, outputPerMTok: 75.0 } },
  { id: "anthropic/claude-opus-4.7",   provider: "openrouter", label: "Claude Opus 4.7",   tier: "high",   released: "2026-03", pricing: { inputPerMTok: 5.0,  outputPerMTok: 25.0 } },
  // Google via OpenRouter
  { id: "google/gemini-2.0-flash-001", provider: "openrouter", label: "Gemini 2.0 Flash",        tier: "low",    released: "2025-02", pricing: { inputPerMTok: 0.075, outputPerMTok: 0.3  } },
  { id: "google/gemini-2.5-flash",     provider: "openrouter", label: "Gemini 2.5 Flash",         tier: "low",    released: "2025-06", pricing: { inputPerMTok: 0.3,   outputPerMTok: 2.5  } },
  { id: "google/gemini-2.5-flash-lite",provider: "openrouter", label: "Gemini 2.5 Flash Lite",    tier: "low",    released: "2025-06", pricing: null },
  { id: "google/gemini-2.5-pro",       provider: "openrouter", label: "Gemini 2.5 Pro",           tier: "medium", released: "2025-05", pricing: { inputPerMTok: 1.25, outputPerMTok: 10.0 } },
  { id: "google/gemini-2.0-pro",       provider: "openrouter", label: "Gemini 2.0 Pro",           tier: "medium", released: "2025-02", pricing: null },
  { id: "google/gemma-3-27b-it",       provider: "openrouter", label: "Gemma 3 27B",              tier: "low",    released: "2025-03", pricing: null },
  // DeepSeek
  { id: "deepseek/deepseek-chat-v3",   provider: "openrouter", label: "DeepSeek V3",     tier: "low",  notes: "$0.27/$1.10", released: "2024-12", pricing: { inputPerMTok: 0.27, outputPerMTok: 1.10 } },
  { id: "deepseek/deepseek-r1",        provider: "openrouter", label: "DeepSeek R1",     tier: "low",  notes: "raciocínio",  released: "2025-01", pricing: { inputPerMTok: 0.55, outputPerMTok: 2.19 } },
  { id: "deepseek/deepseek-r1-0528",   provider: "openrouter", label: "DeepSeek R1 0528",tier: "low",  notes: "raciocínio",  released: "2025-05", pricing: null },
  { id: "deepseek/deepseek-v4-flash",  provider: "openrouter", label: "DeepSeek V4 Flash",tier:"low",  notes: "$0.14/$0.28", released: "2026-04", pricing: { inputPerMTok: 0.14, outputPerMTok: 0.28 } },
  { id: "deepseek/deepseek-v4-pro",    provider: "openrouter", label: "DeepSeek V4 Pro", tier: "low",  notes: "$0.43/$0.87", released: "2026-04", pricing: { inputPerMTok: 0.43, outputPerMTok: 0.87 } },
  // Qwen
  { id: "qwen/qwen-2.5-72b-instruct",  provider: "openrouter", label: "Qwen 2.5 72B",    tier: "low",  released: "2024-09", pricing: null },
  { id: "qwen/qwq-32b",                provider: "openrouter", label: "Qwen QwQ 32B",    tier: "low",  notes: "raciocínio", released: "2025-03", pricing: null },
  { id: "qwen/qwen3-235b-a22b",        provider: "openrouter", label: "Qwen3 235B A22B", tier: "low",  released: "2025-04", pricing: null },
  // Meta
  { id: "meta-llama/llama-3.3-70b-instruct", provider: "openrouter", label: "Llama 3.3 70B",   tier: "low", released: "2024-12", pricing: null },
  { id: "meta-llama/llama-4-scout",          provider: "openrouter", label: "Llama 4 Scout",    tier: "low", released: "2025-04", pricing: null },
  { id: "meta-llama/llama-4-maverick",       provider: "openrouter", label: "Llama 4 Maverick", tier: "low", released: "2025-04", pricing: null },
  // Mistral
  { id: "mistralai/mistral-small-2603",   provider: "openrouter", label: "Mistral Small 2603", tier: "low",    released: "2026-03", pricing: null },
  { id: "mistralai/mistral-large-2411",   provider: "openrouter", label: "Mistral Large 2411", tier: "medium", released: "2024-11", pricing: { inputPerMTok: 2.0, outputPerMTok: 6.0 } },
  { id: "mistralai/codestral-2501",       provider: "openrouter", label: "Codestral 2501",     tier: "low",    notes: "código",      released: "2025-01", pricing: null },
  // Cohere
  { id: "cohere/command-r-plus-08-2024", provider: "openrouter", label: "Command R+ 08-24", tier: "medium", released: "2024-08", pricing: { inputPerMTok: 2.5, outputPerMTok: 10.0 } },
  { id: "cohere/command-r-08-2024",      provider: "openrouter", label: "Command R 08-24",  tier: "low",    released: "2024-08", pricing: null },
  // xAI Grok
  { id: "x-ai/grok-3",    provider: "openrouter", label: "Grok 3",    tier: "medium", released: "2025-02", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "x-ai/grok-3-mini",provider: "openrouter", label: "Grok 3 mini",tier: "low", released: "2025-02", pricing: { inputPerMTok: 0.3,  outputPerMTok: 0.5  } },
  { id: "x-ai/grok-4",    provider: "openrouter", label: "Grok 4",    tier: "medium", released: "2025-07", pricing: { inputPerMTok: 3.0,  outputPerMTok: 15.0 } },
  { id: "x-ai/grok-4-fast",provider: "openrouter", label: "Grok 4 Fast",tier: "low", released: "2025-09", pricing: { inputPerMTok: 0.2,  outputPerMTok: 0.5  } },
  // Free adicionais (Llama 4 / Gemma novos)
  { id: "meta-llama/llama-4-scout:free",   provider: "openrouter", label: "Llama 4 Scout (free)",   tier: "free", notes: "free",                 released: "2025-04", pricing: null },
  { id: "deepseek/deepseek-v3.1:free",     provider: "openrouter", label: "DeepSeek V3.1 (free)",   tier: "free", notes: "free",                 released: "2025-08", pricing: null },
  // Microsoft
  { id: "microsoft/phi-4",              provider: "openrouter", label: "Phi-4",            tier: "low", released: "2024-12", pricing: null },
  // Perplexity
  { id: "perplexity/sonar",            provider: "openrouter", label: "Sonar",             tier: "low",    notes: "search", released: "2025-01", pricing: null },
  { id: "perplexity/sonar-pro",        provider: "openrouter", label: "Sonar Pro",         tier: "medium", notes: "search", released: "2025-01", pricing: null },
  { id: "perplexity/sonar-reasoning",  provider: "openrouter", label: "Sonar Reasoning",   tier: "low",    notes: "search+R1", released: "2025-02", pricing: null },
];

/** Array canônico , fonte única de verdade. */
export const MODELS: ModelEntry[] = [
  ...OPENAI,
  ...ANTHROPIC,
  ...GEMINI,
  ...OPENROUTER,
];

// ─── Suporte a raciocínio ─────────────────────────────────────────────────────
// Preenchido por id. Fonte e critério:
// docs/superpowers/research/2026-05-22-modelos-raciocinio.md. Só modelos OpenAI
// nesta entrega , o wiring de reasoning_effort cobre o provider OpenAI; o card
// de Modo Raciocínio só destrava quando há wiring real por trás.
const REASONING_LEVELS: Record<string, ReasoningLevel[]> = {
  // OpenAI , GPT-5 series + o-series
  "gpt-5.5": ["minimal", "low", "medium", "high"],
  "gpt-5.5-pro": ["minimal", "low", "medium", "high"],
  "gpt-5.4": ["minimal", "low", "medium", "high"],
  "gpt-5.4-pro": ["minimal", "low", "medium", "high"],
  "gpt-5.4-mini": ["minimal", "low", "medium", "high"],
  "gpt-5.4-nano": ["minimal", "low", "medium", "high"],
  "gpt-5.3-codex": ["minimal", "low", "medium", "high"],
  "gpt-5.2": ["minimal", "low", "medium", "high"],
  "gpt-5.1": ["minimal", "low", "medium", "high"],
  "gpt-5.1-codex-mini": ["minimal", "low", "medium", "high"],
  "gpt-5": ["minimal", "low", "medium", "high"],
  "gpt-5-codex": ["minimal", "low", "medium", "high"],
  "gpt-5-mini": ["minimal", "low", "medium", "high"],
  "gpt-5-nano": ["minimal", "low", "medium", "high"],
  "o3-pro": ["low", "medium", "high"],
  o3: ["low", "medium", "high"],
  "o1-pro": ["low", "medium", "high"],
  o1: ["low", "medium", "high"],
  // Anthropic , Claude 4.x com extended thinking (budget tokens internos)
  "claude-opus-4-7": ["low", "medium", "high"],
  "claude-sonnet-4-7": ["low", "medium", "high"],
  "claude-opus-4-5": ["low", "medium", "high"],
  "claude-sonnet-4-5": ["low", "medium", "high"],
  // Google , Gemini 2.5/3.x com thinking_config
  "gemini-2.5-pro": ["low", "medium", "high"],
  "gemini-2.5-flash": ["low", "medium", "high"],
  "gemini-3-pro": ["low", "medium", "high"],
  "gemini-3.5-flash": ["low", "medium", "high"],
  // OpenRouter (mesmos providers via gateway)
  "anthropic/claude-opus-4.7": ["low", "medium", "high"],
  "anthropic/claude-sonnet-4.7": ["low", "medium", "high"],
  "anthropic/claude-opus-4.5": ["low", "medium", "high"],
  "anthropic/claude-sonnet-4.5": ["low", "medium", "high"],
  "google/gemini-2.5-pro": ["low", "medium", "high"],
  "google/gemini-2.5-flash": ["low", "medium", "high"],
  // DeepSeek R1 , reasoning nativo (sem effort, modelado como medium)
  "deepseek/deepseek-r1": ["medium"],
  "deepseek/deepseek-r1-0528": ["medium"],
  "deepseek/deepseek-r1:free": ["medium"],
  "deepseek/deepseek-r1-0528:free": ["medium"],
  // Qwen QwQ , reasoning nativo
  "qwen/qwq-32b": ["medium"],
  "qwen/qwq-32b:free": ["medium"],
};

for (const m of MODELS) {
  const levels = REASONING_LEVELS[m.id];
  if (levels) m.reasoning = { levels };
}

// ============================================================================
// REASONING_CAPS - Capability table canônica (Onda 1 do plan de modernização).
// Substitui REASONING_LEVELS gradualmente. Documentação em
// docs/superpowers/specs/2026-05-25-reasoning-caps-table.md.
// ============================================================================

/**
 * Capability de raciocínio por modelo. Única fonte da verdade para a UI
 * e adapters decidirem como passar reasoning ao provider.
 */
export interface ReasoningCap {
  /** Níveis aceitos no parâmetro reasoningEffort. ["auto"] = modelo decide. */
  levels: ReasoningLevel[];
  /** false = card UI desativa quando este modelo for o ativo. */
  enabled: boolean;
  /** Tools + reasoning simultâneos? (Haiku 4.5 = false). */
  supportsWithTools: boolean;
  /** Provider decide internamente quando/quanto pensar (Anthropic adaptive, Gemini -1). */
  adaptiveMode: boolean;
  /** Endpoint canônico OpenAI. */
  openaiEndpoint?: "responses" | "chat-completions";
  /** Anthropic: tipo de thinking. */
  anthropicThinking?: "adaptive" | "enabled";
  /** Anthropic: precisa de beta header interleaved? false = sim. */
  anthropicInterleavedAuto?: boolean;
  /** Faixa numérica do budget (Anthropic budget_tokens, Gemini thinkingBudget). */
  budgetRange?: [number, number];
  /** Gemini: shape do parametro (3.x usa level string; 2.5 usa budget int). */
  geminiShape?: "level" | "budget";
  /** OpenRouter: como passar reasoning (effort string vs max_tokens int). */
  openrouterShape?: "effort" | "max_tokens";
  /** Cap de output_tokens conhecido do modelo. Opcional (OpenAI omite). */
  outputCap?: number;
  /** Quando adaptiveMode=true OU levels=["auto"], texto curto para subtítulo da UI. */
  autoModeHint?: string;
  /** Timeout customizado em ms. Default 90000. */
  requestTimeoutMs?: number;
}

/** Tabela canônica. Linhas ausentes => `reasoningCapsOf` retorna null. */
export const REASONING_CAPS: Record<string, ReasoningCap> = {
  // -------- OpenAI (sempre Responses, supportsWithTools=true) --------
  "gpt-5.5":            { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.5-pro":        { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 180_000 },
  "gpt-5.4":            { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.4-mini":       { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.4-nano":       { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 60_000 },
  "gpt-5.4-pro":        { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 180_000 },
  "gpt-5":              { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5-mini":         { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5-nano":         { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 60_000 },
  "gpt-5.3-codex":      { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.2":            { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.1":            { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "gpt-5.1-codex-mini": { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 60_000 },
  "gpt-5-codex":        { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 90_000 },
  "o3":                 { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 120_000 },
  "o3-pro":             { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 240_000 },
  "o1":                 { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 120_000 },
  "o1-pro":             { levels: ["low", "medium", "high"],            enabled: true, supportsWithTools: true, adaptiveMode: false, openaiEndpoint: "responses", requestTimeoutMs: 240_000 },

  // -------- Anthropic --------
  "claude-opus-4-7":    { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: true,  anthropicThinking: "adaptive", anthropicInterleavedAuto: true,  budgetRange: [1024, 24000], outputCap: 128_000 },
  "claude-sonnet-4-7":  { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: true,  anthropicThinking: "adaptive", anthropicInterleavedAuto: true,  budgetRange: [1024, 24000], outputCap: 64_000 },
  "claude-opus-4-6":    { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: true,  anthropicThinking: "adaptive", anthropicInterleavedAuto: true,  budgetRange: [1024, 24000], outputCap: 128_000 },
  "claude-sonnet-4-6":  { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: true,  anthropicThinking: "adaptive", anthropicInterleavedAuto: true,  budgetRange: [1024, 24000], outputCap: 64_000 },
  "claude-opus-4-5":    { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: false, anthropicThinking: "enabled",  anthropicInterleavedAuto: false, budgetRange: [1024, 16000], outputCap: 64_000 },
  "claude-sonnet-4-5":  { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true,  adaptiveMode: false, anthropicThinking: "enabled",  anthropicInterleavedAuto: false, budgetRange: [1024, 16000], outputCap: 64_000 },
  "claude-haiku-4-5":   { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: false, adaptiveMode: false, anthropicThinking: "enabled",  anthropicInterleavedAuto: false, budgetRange: [1024,  8000], outputCap: 64_000 },

  // -------- Gemini --------
  "gemini-2.5-pro":         { levels: ["low", "medium", "high"],           enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "budget", budgetRange: [128, 32768], outputCap: 65_535 },
  "gemini-2.5-flash":       { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "budget", budgetRange: [0, 24576],   outputCap: 65_535 },
  "gemini-2.5-flash-lite":  { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "budget", budgetRange: [512, 24576], outputCap: 65_535 },
  "gemini-2.5-pro-thinking":   { levels: ["low", "medium", "high"],           enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "budget", budgetRange: [128, 32768], outputCap: 65_535 },
  "gemini-2.5-flash-thinking": { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "budget", budgetRange: [0, 24576],   outputCap: 65_535 },
  "gemini-3-pro":           { levels: ["low", "medium", "high"],           enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "level",  outputCap: 65_535 },
  "gemini-3.1-pro":         { levels: ["auto"],                            enabled: true, supportsWithTools: true, adaptiveMode: true,  geminiShape: "level",  outputCap: 65_535, autoModeHint: "baixo, médio, alto" },
  "gemini-3.5-flash":       { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "level",  outputCap: 65_535 },
  "gemini-3-flash":         { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, geminiShape: "level",  outputCap: 65_535 },

  // -------- OpenRouter (todos com supportsWithTools=true, enabled=true) --------
  "deepseek/deepseek-r1":              { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "deepseek/deepseek-r1:free":         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "deepseek/deepseek-r1-0528":         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "deepseek/deepseek-r1-0528:free":    { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "qwen/qwq-32b":                      { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "qwen/qwq-32b:free":                 { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "anthropic/claude-opus-4.7":         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: true,  openrouterShape: "effort" },
  "anthropic/claude-sonnet-4.7":       { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: true,  openrouterShape: "effort" },
  "anthropic/claude-opus-4.6":         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: true,  openrouterShape: "effort" },
  "anthropic/claude-sonnet-4.6":       { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: true,  openrouterShape: "effort" },
  "anthropic/claude-opus-4.5":         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "anthropic/claude-sonnet-4.5":       { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "google/gemini-2.5-pro":             { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "max_tokens" },
  "google/gemini-2.5-flash":           { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "max_tokens" },
  "google/gemini-3-pro":               { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "max_tokens" },
  "google/gemini-3.1-pro":             { levels: ["auto"],                  enabled: true, supportsWithTools: true, adaptiveMode: true,  openrouterShape: "max_tokens", autoModeHint: "médio, alto" },
  "openai/gpt-5.4":                    { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "openai/gpt-5.4-mini":               { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "openai/gpt-5.4-nano":               { levels: ["minimal", "low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
  "openai/o3":                         { levels: ["low", "medium", "high"], enabled: true, supportsWithTools: true, adaptiveMode: false, openrouterShape: "effort" },
};

/** Retorna a capability completa do modelo. null se ausente do mapa. */
export function reasoningCapsOf(modelId: string): ReasoningCap | null {
  return REASONING_CAPS[modelId] ?? null;
}

/** Output cap conhecido (Anthropic obrigatório, OpenAI omite). */
export function modelOutputCap(modelId: string): number | undefined {
  return REASONING_CAPS[modelId]?.outputCap;
}

/**
 * Mapping effort → budget numérico, clampado ao budgetRange do modelo.
 * Retorna null quando o modelo não usa budget (OpenAI Responses, OpenRouter shape=effort).
 * `auto` retorna o teto do range (deixa o provider decidir dentro).
 */
export function effortToBudget(modelId: string, effort: ReasoningLevel): number | null {
  const cap = REASONING_CAPS[modelId];
  if (!cap || !cap.budgetRange) return null;
  const [min, max] = cap.budgetRange;
  const span = max - min;
  switch (effort) {
    case "minimal": return min;
    case "low":     return min + Math.floor(span * 0.2);
    case "medium":  return min + Math.floor(span * 0.5);
    case "high":    return max;
    case "auto":    return max; // teto, provider decide dentro
  }
}

/** `true` se o modelo suporta modo raciocínio (thinking). */
export function modelSupportsReasoning(id: string): boolean {
  // Mantém compat: usa REASONING_CAPS quando disponível; senão cai no map antigo.
  const cap = REASONING_CAPS[id];
  if (cap) return cap.enabled;
  return (getModel(id)?.reasoning?.levels.length ?? 0) > 0;
}

/** Níveis de raciocínio aceitos pelo modelo; vazio quando não suporta. */
export function reasoningLevelsOf(id: string): ReasoningLevel[] {
  return REASONING_CAPS[id]?.levels ?? (getModel(id)?.reasoning?.levels ?? []);
}

/** Retorna um modelo pelo id exato, ou undefined. */
export function getModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Modelos lançados antes de 2024-01 são considerados legados.
 * Mantidos no array para que `getModel` continue retornando, mas filtrados
 * nas listagens (exceto áudio, onde `whisper-1` ainda é usado em produção).
 */
export function isLegacyModel(m: ModelEntry): boolean {
  if (m.use === "áudio") return false;
  return !!m.released && m.released < "2024-01";
}

/** Marca legacy no label visual ("(legado)"). */
export function labelWithLegacy(m: ModelEntry): string {
  return isLegacyModel(m) ? `${m.label} (legado)` : m.label;
}

/** Custo médio (input+output)/2 por MTok , para ordenar do mais caro ao mais barato. */
function avgCost(m: ModelEntry): number {
  if (!m.pricing) return -1;
  return (m.pricing.inputPerMTok + m.pricing.outputPerMTok) / 2;
}

/**
 * Score de "família/versão" extraído do id. Famílias mais novas têm score
 * maior. Ex.: gpt-5.5 > gpt-5.4 > gpt-5 > gpt-4.1 > gpt-4o > gpt-4 > o3 > o1.
 * Para Claude: opus/sonnet/haiku 4.7 > 4.6 > 4.5 > 3.7 > 3.5. Para Gemini:
 * 3.x > 2.5 > 2.0 > 1.5. Empate cai pro próximo critério.
 */
function familyScore(m: ModelEntry): number {
  const id = m.id.toLowerCase();
  // Captura "X.Y" ou "X" como número (GPT-5.5 -> 5.5, GPT-5 -> 5)
  const m1 = id.match(/(?:gpt-|claude-(?:opus|sonnet|haiku)-|gemini-|grok-|llama-|deepseek-(?:r|v)?|qwen)(\d+(?:[.-]\d+)?)/);
  if (!m1) return 0;
  return parseFloat(m1[1].replace("-", "."));
}

/**
 * Ordena modelos. Regras (em ordem):
 *  1. Família/versão mais nova primeiro (gpt-5.5 antes de gpt-5.4-pro).
 *  2. Data de lançamento mais recente primeiro.
 *  3. Custo médio mais alto primeiro.
 *  4. Alfabético do id (desempate determinístico).
 */
export function sortModels(models: ModelEntry[]): ModelEntry[] {
  return [...models].sort((a, b) => {
    const famA = familyScore(a);
    const famB = familyScore(b);
    if (famA !== famB) return famB - famA;
    const relA = a.released ?? "0000-00";
    const relB = b.released ?? "0000-00";
    if (relA !== relB) return relB.localeCompare(relA);
    const costA = avgCost(a);
    const costB = avgCost(b);
    if (costA !== costB) return costB - costA;
    return a.id.localeCompare(b.id);
  });
}

/** Ordem dos tiers OpenRouter (mais caro primeiro; free no final). */
const OPENROUTER_TIER_RANK: Record<string, number> = {
  premium: 0,
  high: 1,
  medium: 2,
  low: 3,
  free: 4,
};

/** Prefixo do provedor em ids OpenRouter (ex.: "openai/gpt-..." → "openai"). */
function openrouterProvider(m: ModelEntry): string {
  const idx = m.id.indexOf("/");
  return idx > 0 ? m.id.slice(0, idx).toLowerCase() : "zzz";
}

/**
 * Ordenacao especial para OpenRouter:
 *  1. Tier (premium → high → medium → low → free, free SEMPRE no final).
 *  2. Dentro do tier: data mais recente primeiro.
 *  3. Empate: alfabetico do id.
 *
 * NAO agrupa por provedor , modelos do mesmo tier podem misturar OpenAI,
 * Anthropic, DeepSeek etc. de acordo com a data de lancamento.
 */
export function sortOpenrouterModels(models: ModelEntry[]): ModelEntry[] {
  return [...models].sort((a, b) => {
    const ta = OPENROUTER_TIER_RANK[a.tier] ?? 9;
    const tb = OPENROUTER_TIER_RANK[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    const relA = a.released ?? "0000-00";
    const relB = b.released ?? "0000-00";
    if (relA !== relB) return relB.localeCompare(relA);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Retorna todos os modelos de um provider, já ordenados.
 * Por padrão filtra legados (released < 2024, exceto áudio); passe
 * `{ includeLegacy: true }` para trazer tudo.
 */
export function listModels(
  provider: LlmProvider,
  opts: { includeLegacy?: boolean } = {},
): ModelEntry[] {
  const all = MODELS.filter(
    (m) => m.provider === provider && m.use !== "áudio" && m.use !== "embedding",
  );
  const filtered = opts.includeLegacy ? all : all.filter((m) => !isLegacyModel(m));
  return provider === "openrouter"
    ? sortOpenrouterModels(filtered)
    : sortModels(filtered);
}

/** Capacidades multimodais de um modelo. */
export interface ModelCapabilities {
  /** Entende imagem (visão multimodal). */
  vision: boolean;
  /** Entende áudio (transcrição de voz). */
  audio: boolean;
}

/**
 * Capacidades de um modelo pelo id. Modelo desconhecido → tudo `false`.
 * Fonte: as flags `vision`/`audio` de cada `ModelEntry`.
 */
export function modelCapabilities(id: string): ModelCapabilities {
  const m = getModel(id);
  return { vision: m?.vision ?? false, audio: m?.audio ?? false };
}

/** Modelos de um provider que entendem áudio (transcrição de voz), ordenados. */
export function listAudioModels(provider: LlmProvider): ModelEntry[] {
  return sortModels(MODELS.filter((m) => m.provider === provider && m.audio));
}

/** Famílias OpenRouter conhecidamente multimodais (aceitam imagem). OpenRouter
 *  proxia modelos de varios provedores; a visão e' por modelo subjacente. Usamos
 *  um allowlist conservador por padrao de id (familias documentadas como vision).
 */
const OPENROUTER_VISION_RE =
  /(gemini|gpt-4o|gemma-3|llama-4|pixtral|claude-3\.5|claude-(sonnet|opus)-4|qwen[\w-]*vl)/i;

/** True se o modelo entende imagem (flag explicita OU familia vision do OpenRouter). */
export function modelHasVision(m: ModelEntry): boolean {
  return Boolean(m.vision) || (m.provider === "openrouter" && OPENROUTER_VISION_RE.test(m.id));
}

/** Modelos de um provider que entendem imagem (visão multimodal), ordenados. */
export function listVisionModels(provider: LlmProvider): ModelEntry[] {
  return sortModels(MODELS.filter((m) => m.provider === provider && modelHasVision(m)));
}

/** Modelos de embedding de um provider (use === "embedding"), ordenados.
 *  Usado pelo sub-bloco Embeddings da Configuração de Router (R2-ctx). */
export function listEmbeddingModels(provider: LlmProvider): ModelEntry[] {
  return sortModels(
    MODELS.filter((m) => m.provider === provider && m.use === "embedding"),
  );
}

/** Provedores que têm ao menos um modelo de embedding. */
export const PROVIDERS_WITH_EMBEDDING: LlmProvider[] = (
  ["openai", "anthropic", "gemini", "openrouter"] as LlmProvider[]
).filter((p) => MODELS.some((m) => m.provider === p && m.use === "embedding"));

/** Provedores que têm ao menos um modelo de áudio. */
export const PROVIDERS_WITH_AUDIO: LlmProvider[] = (
  ["openai", "anthropic", "gemini", "openrouter"] as LlmProvider[]
).filter((p) => MODELS.some((m) => m.provider === p && m.audio));

/** Provedores que têm ao menos um modelo de visão. */
export const PROVIDERS_WITH_VISION: LlmProvider[] = (
  ["openai", "anthropic", "gemini", "openrouter"] as LlmProvider[]
).filter((p) => MODELS.some((m) => m.provider === p && modelHasVision(m)));

/** Linha de descrição "preço · para que serve" para o select de modelo. */
export function modelDescription(m: ModelEntry): string {
  const use = m.use ?? "conversação";
  if (!m.pricing) return `preço sob consulta · ${use}`;
  const fmt = (n: number) => `$${n}`;
  if (m.pricing.perMinuteUsd !== undefined) {
    return `${fmt(m.pricing.perMinuteUsd)}/min · ${use}`;
  }
  return `${fmt(m.pricing.inputPerMTok)}/${fmt(m.pricing.outputPerMTok)} por 1M · ${use}`;
}

export interface CostResult {
  /** Custo em USD. null quando pricing=null (costKnown=false). */
  costUsd: number | null;
  /** false = modelo sem preço conhecido , não registrar como 0. */
  costKnown: boolean;
}

/**
 * Calcula o custo de uma chamada LLM.
 * Retorna `costKnown=false` quando o modelo não tem pricing (BUG 2 corrigido).
 */
export function calculateCost(
  modelId: string,
  tokensInput: number,
  tokensOutput: number,
  extras?: { durationMs?: number },
): CostResult {
  const entry = getModel(modelId);
  if (!entry || entry.pricing === null) {
    return { costUsd: null, costKnown: false };
  }

  const { pricing } = entry;

  // Modelos de áudio cobrados por minuto
  if (
    pricing.perMinuteUsd !== undefined &&
    extras?.durationMs !== undefined &&
    extras.durationMs > 0
  ) {
    const cost = (extras.durationMs / 60_000) * pricing.perMinuteUsd;
    return {
      // 10 casas decimais: custos de embedding por chamada sao da ordem de
      // 1e-7 USD e zerariam com 6 casas. Modelos de chat nao sao afetados.
      costUsd: Math.round(cost * 1e10) / 1e10,
      costKnown: true,
    };
  }

  const cost =
    (tokensInput * pricing.inputPerMTok + tokensOutput * pricing.outputPerMTok) /
    1_000_000;

  return {
    // 10 casas decimais (ver branch de audio): preserva custos minusculos de
    // embedding que zerariam com 6 casas.
    costUsd: Math.round(cost * 1e10) / 1e10,
    costKnown: true,
  };
}
