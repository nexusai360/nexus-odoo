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

/** Para que serve o modelo — usado na linha de descrição do select. */
export type ModelUse =
  | "conversação"
  | "código"
  | "áudio"
  | "raciocínio"
  | "raciocínio profundo"
  | "busca";

/** Níveis de esforço de raciocínio (thinking), do menor ao maior. */
export type ReasoningLevel = "minimal" | "low" | "medium" | "high";

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
  { id: "gpt-4-turbo",         provider: "openai", label: "GPT-4 Turbo",      tier: "high",                           released: "2024-04", pricing: { inputPerMTok: 10.0,  outputPerMTok: 30.0  }, vision: true },
  { id: "gpt-4",               provider: "openai", label: "GPT-4",            tier: "medium",                         released: "2023-03", pricing: { inputPerMTok: 30.0,  outputPerMTok: 60.0  } },
  // Áudio (transcrição).
  { id: "gpt-4o-transcribe",      provider: "openai", label: "GPT-4o Transcribe",      tier: "low", use: "áudio", audio: true, released: "2025-03", pricing: { inputPerMTok: 6.0, outputPerMTok: 10.0 } },
  { id: "gpt-4o-mini-transcribe", provider: "openai", label: "GPT-4o mini Transcribe", tier: "low", use: "áudio", audio: true, released: "2025-03", pricing: { inputPerMTok: 3.0, outputPerMTok: 5.0 } },
  { id: "whisper-1",           provider: "openai", label: "Whisper-1",        tier: "low",     use: "áudio", audio: true, released: "2022-09", pricing: { inputPerMTok: 0, outputPerMTok: 0, perMinuteUsd: 0.006 } },
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
  { id: "gemini-2.5-pro",        provider: "gemini", label: "Gemini 2.5 Pro",         tier: "high",   notes: "atual mais novo", released: "2025-09", pricing: { inputPerMTok: 1.25, outputPerMTok: 10.0 }, vision: true, audio: true },
  { id: "gemini-2.5-flash",      provider: "gemini", label: "Gemini 2.5 Flash",       tier: "low",                              released: "2025-09", pricing: { inputPerMTok: 0.3,  outputPerMTok: 2.5  }, vision: true, audio: true },
  { id: "gemini-2.5-flash-lite", provider: "gemini", label: "Gemini 2.5 Flash Lite",  tier: "low",                              released: "2025-09", pricing: { inputPerMTok: 0.1,  outputPerMTok: 0.4  }, vision: true, audio: true },
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
  { id: "x-ai/grok-3",    provider: "openrouter", label: "Grok 3",    tier: "medium", released: "2025-02", pricing: null },
  { id: "x-ai/grok-3-mini",provider: "openrouter", label: "Grok 3 mini",tier: "low", released: "2025-02", pricing: null },
  { id: "x-ai/grok-4",    provider: "openrouter", label: "Grok 4",    tier: "medium", released: "2025-07", pricing: null },
  // Microsoft
  { id: "microsoft/phi-4",              provider: "openrouter", label: "Phi-4",            tier: "low", released: "2024-12", pricing: null },
  // Perplexity
  { id: "perplexity/sonar",            provider: "openrouter", label: "Sonar",             tier: "low",    notes: "search", released: "2025-01", pricing: null },
  { id: "perplexity/sonar-pro",        provider: "openrouter", label: "Sonar Pro",         tier: "medium", notes: "search", released: "2025-01", pricing: null },
  { id: "perplexity/sonar-reasoning",  provider: "openrouter", label: "Sonar Reasoning",   tier: "low",    notes: "search+R1", released: "2025-02", pricing: null },
];

/** Array canônico — fonte única de verdade. */
export const MODELS: ModelEntry[] = [
  ...OPENAI,
  ...ANTHROPIC,
  ...GEMINI,
  ...OPENROUTER,
];

// ─── Suporte a raciocínio ─────────────────────────────────────────────────────
// Preenchido por id. Fonte e critério:
// docs/superpowers/research/2026-05-22-modelos-raciocinio.md. Só modelos OpenAI
// nesta entrega — o wiring de reasoning_effort cobre o provider OpenAI; o card
// de Modo Raciocínio só destrava quando há wiring real por trás.
const REASONING_LEVELS: Record<string, ReasoningLevel[]> = {
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
};

for (const m of MODELS) {
  const levels = REASONING_LEVELS[m.id];
  if (levels) m.reasoning = { levels };
}

/** `true` se o modelo suporta modo raciocínio (thinking). */
export function modelSupportsReasoning(id: string): boolean {
  return (getModel(id)?.reasoning?.levels.length ?? 0) > 0;
}

/** Níveis de raciocínio aceitos pelo modelo; vazio quando não suporta. */
export function reasoningLevelsOf(id: string): ReasoningLevel[] {
  return getModel(id)?.reasoning?.levels ?? [];
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

/** Custo médio (input+output)/2 por MTok — para ordenar do mais caro ao mais barato. */
function avgCost(m: ModelEntry): number {
  if (!m.pricing) return -1;
  return (m.pricing.inputPerMTok + m.pricing.outputPerMTok) / 2;
}

/**
 * Ordena modelos: mais recente → mais antigo; dentro da mesma data,
 * mais caro → mais barato. Sem preço por último no grupo.
 */
export function sortModels(models: ModelEntry[]): ModelEntry[] {
  return [...models].sort((a, b) => {
    const relA = a.released ?? "0000-00";
    const relB = b.released ?? "0000-00";
    if (relA !== relB) return relB.localeCompare(relA);
    return avgCost(b) - avgCost(a);
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
  const all = MODELS.filter((m) => m.provider === provider);
  const filtered = opts.includeLegacy ? all : all.filter((m) => !isLegacyModel(m));
  return sortModels(filtered);
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

/** Modelos de um provider que entendem imagem (visão multimodal), ordenados. */
export function listVisionModels(provider: LlmProvider): ModelEntry[] {
  return sortModels(MODELS.filter((m) => m.provider === provider && m.vision));
}

/** Provedores que têm ao menos um modelo de áudio. */
export const PROVIDERS_WITH_AUDIO: LlmProvider[] = (
  ["openai", "anthropic", "gemini", "openrouter"] as LlmProvider[]
).filter((p) => MODELS.some((m) => m.provider === p && m.audio));

/** Provedores que têm ao menos um modelo de visão. */
export const PROVIDERS_WITH_VISION: LlmProvider[] = (
  ["openai", "anthropic", "gemini", "openrouter"] as LlmProvider[]
).filter((p) => MODELS.some((m) => m.provider === p && m.vision));

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
  /** false = modelo sem preço conhecido — não registrar como 0. */
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
      costUsd: Math.round(cost * 1_000_000) / 1_000_000,
      costKnown: true,
    };
  }

  const cost =
    (tokensInput * pricing.inputPerMTok + tokensOutput * pricing.outputPerMTok) /
    1_000_000;

  return {
    costUsd: Math.round(cost * 1_000_000) / 1_000_000,
    costKnown: true,
  };
}
