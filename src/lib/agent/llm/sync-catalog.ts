/**
 * Sincronização do catálogo de modelos a partir da API do provedor.
 *
 * Consulta a API de listagem do provedor, compara com o catálogo efetivo
 * (base do `catalog.ts` + tabela `llm_model_entry`) e faz upsert dos modelos
 * novos / atualizações na tabela. Preço: OpenRouter expõe na API; OpenAI/
 * Anthropic/Gemini não , para esses, modelos novos entram com `pricing: null`
 * (sinalizados para curadoria manual).
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { MODELS, type LlmProvider } from "./catalog";
import { isAllowedByWhitelist } from "./sync-whitelist";

export interface SyncResult {
  provider: LlmProvider;
  novos: string[];
  atualizados: string[];
  /** Modelos ignorados por nao estar na whitelist do provider. */
  ignoradosWhitelist: string[];
  /** Modelos ignorados por nao terem pricing (input/output). */
  ignoradosSemPricing: string[];
  /** Ids marcados como deprecated por nao virem mais no sync. */
  depreciados: string[];
  /** Ids que voltaram (deprecated_at -> null). */
  revividos: string[];
  erro?: string;
}

interface FetchedModel {
  id: string;
  label: string;
  pricingInput: number | null;
  pricingOutput: number | null;
}

async function fetchOpenAI(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI listing failed: ${res.status}`);
  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data.map((m) => ({
    id: m.id,
    label: m.id,
    pricingInput: null,
    pricingOutput: null,
  }));
}

/**
 * Humaniza o id "vendor/model-x" do OpenRouter para nosso padrao.
 * Ex.: "openai/gpt-5.4-mini" -> "GPT-5.4 Mini",
 *      "anthropic/claude-opus-4.7" -> "Claude Opus 4.7",
 *      "google/gemini-2.5-pro" -> "Gemini 2.5 Pro",
 *      "deepseek/deepseek-r1:free" -> "DeepSeek R1 (free)".
 */
function humanizeOpenrouterLabel(id: string, apiName?: string): string {
  const isFree = id.endsWith(":free");
  const cleanId = id.replace(/:free$/, "");
  const idx = cleanId.indexOf("/");
  if (idx < 0) return apiName ?? id;
  const slug = cleanId.slice(idx + 1);
  // Vendor-specific casing
  const parts = slug.split(/[-_]/).map((p) => {
    if (/^\d/.test(p)) return p; // numero puro
    if (/^v\d/i.test(p)) return p.toUpperCase();
    if (p.toLowerCase() === "gpt") return "GPT";
    if (p.toLowerCase() === "qwq") return "QwQ";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  });
  // Mantem "gpt-5.4-mini" como "GPT-5.4 Mini" , primeiro junta GPT com numero
  let label = parts.join(" ").replace(/GPT\s+(\d)/, "GPT-$1");
  // Claude/Gemini: prefere "Claude Sonnet 4.7" (juntar palavras)
  label = label.replace(/^(Claude|Gemini|Llama|DeepSeek|Qwen|Grok|Mistral|Phi|Gemma|Command|Sonar)\s/, "$1 ");
  if (isFree) label = `${label} (free)`;
  return label;
}

/**
 * Modelos NAO conversacionais que devem ser descartados do dropdown.
 * Identificacao por sufixos/keywords no id.
 */
function isOpenrouterNonChat(id: string): boolean {
  const lower = id.toLowerCase();
  if (/(image|tts|stt|whisper|embed|moderation|vision-only|rerank|sora|veo|imagen|midjourney|stable-diffusion|dall-e|kling|runway|suno|riffusion|recraft|leonardo|ideogram)/.test(lower)) {
    return true;
  }
  // Modelos legados (pre-2024) por palavras-chave
  if (/-instruct$|-legacy|-deprecated/i.test(lower)) {
    // mantemos llama-*-instruct (sao a versao chat) mas filtramos -instruct-2023
    if (/2023|2022/.test(lower)) return true;
  }
  return false;
}

async function fetchOpenRouter(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter listing failed: ${res.status}`);
  const data = (await res.json()) as {
    data: Array<{
      id: string;
      name?: string;
      created?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    }>;
  };
  return data.data
    .filter((m) => !isOpenrouterNonChat(m.id))
    .filter((m) => {
      // Filtra por architecture: deve ter output text
      const out = m.architecture?.output_modalities ?? ["text"];
      return out.includes("text");
    })
    .filter((m) => {
      // Filtra por data: created e unix timestamp; precisa ser >= 2024-01-01
      if (!m.created) return true; // sem data, deixa passar (whitelist depois decide)
      const cutoff = new Date("2024-01-01").getTime() / 1000;
      return m.created >= cutoff;
    })
    .map((m) => ({
      id: m.id,
      label: humanizeOpenrouterLabel(m.id, m.name),
      pricingInput: m.pricing?.prompt ? Number(m.pricing.prompt) * 1_000_000 : null,
      pricingOutput: m.pricing?.completion ? Number(m.pricing.completion) * 1_000_000 : null,
    }));
}

async function fetchAnthropic(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`Anthropic listing failed: ${res.status}`);
  const data = (await res.json()) as {
    data: Array<{ id: string; display_name?: string; created_at?: string }>;
  };
  return data.data.map((m) => ({
    id: m.id,
    label: m.display_name ?? m.id,
    pricingInput: null,
    pricingOutput: null,
  }));
}

async function fetchGemini(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) throw new Error(`Gemini listing failed: ${res.status}`);
  const data = (await res.json()) as {
    models: Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return data.models
    .filter((m) =>
      (m.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((m) => {
      const id = m.name.startsWith("models/") ? m.name.slice(7) : m.name;
      return {
        id,
        label: m.displayName ?? id,
        pricingInput: null,
        pricingOutput: null,
      };
    });
}

function deriveTier(
  input: number | null,
  output: number | null,
  id?: string,
): string {
  if (id && id.endsWith(":free")) return "free";
  if (input == null || output == null) return "low";
  const avg = (input + output) / 2;
  if (avg < 1) return "low";
  if (avg < 10) return "medium";
  if (avg < 30) return "high";
  return "premium";
}

export async function syncProvider(
  provider: LlmProvider,
  apiKey: string,
): Promise<SyncResult> {
  const out: SyncResult = {
    provider,
    novos: [],
    atualizados: [],
    ignoradosWhitelist: [],
    ignoradosSemPricing: [],
    depreciados: [],
    revividos: [],
  };
  try {
    let fetched: FetchedModel[] = [];
    if (provider === "openai") fetched = await fetchOpenAI(apiKey);
    else if (provider === "openrouter") fetched = await fetchOpenRouter(apiKey);
    else if (provider === "anthropic") fetched = await fetchAnthropic(apiKey);
    else if (provider === "gemini") fetched = await fetchGemini(apiKey);
    else {
      out.erro = `Sincronização para ${provider} ainda não implementada.`;
      return out;
    }

    const knownBase = new Set(
      MODELS.filter((m) => m.provider === provider).map((m) => m.id),
    );
    const overrides = await prisma.llmModelEntry.findMany({
      where: { provider },
      select: { id: true, deprecatedAt: true },
    });
    const knownOverride = new Map(
      overrides.map((o) => [o.id, o.deprecatedAt] as const),
    );

    // Conjunto de ids vistos no sync atual (validos), para detectar deprecated.
    const vistosEsteSync = new Set<string>();

    for (const m of fetched) {
      // Filtro 1: whitelist por provider (recusa modelos antigos/experimentais).
      if (!isAllowedByWhitelist(provider, m.id)) {
        out.ignoradosWhitelist.push(m.id);
        continue;
      }
      // Filtro 2: pricing precisa estar disponivel para entrar no catalogo
      // (caso OpenRouter). OpenAI nao expoe pricing na listagem, entao quando
      // estamos no provider openai aceitamos `null` se a base ja conhecer o id
      // (vai ficar como "sob consulta" ate curadoria). Para qualquer outro
      // provider, exigimos pricing.
      const semPricing =
        m.pricingInput == null || m.pricingOutput == null;
      const aceitaSemPricing = provider === "openai" && knownBase.has(m.id);
      if (semPricing && !aceitaSemPricing) {
        out.ignoradosSemPricing.push(m.id);
        continue;
      }

      vistosEsteSync.add(m.id);
      const inBase = knownBase.has(m.id);
      // OpenRouter expõe pricing oficial via API , SEMPRE persistimos no banco
      // para que o effective-catalog use pricing fresco mesmo nas entries da
      // base com pricing=null. Demais providers respeitam a base versionada.
      if (inBase && provider !== "openrouter") {
        continue;
      }
      const tier = deriveTier(m.pricingInput, m.pricingOutput, m.id);
      const eraDepreciado = (knownOverride.get(m.id) ?? null) != null;
      await prisma.llmModelEntry.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          provider,
          label: m.label,
          tier,
          pricingInput: m.pricingInput,
          pricingOutput: m.pricingOutput,
          source: "sync",
        },
        update: {
          label: m.label,
          tier,
          pricingInput: m.pricingInput,
          pricingOutput: m.pricingOutput,
          // Reativa o modelo se estava marcado como deprecated.
          deprecatedAt: null,
        },
      });
      if (eraDepreciado) out.revividos.push(m.id);
      if (knownOverride.has(m.id)) out.atualizados.push(m.id);
      else out.novos.push(m.id);
    }

    // Detecta deprecated: entries do banco que nao vieram no sync e ainda
    // nao estavam marcadas.
    const aDepreciar: string[] = [];
    for (const [id, deprecatedAt] of knownOverride) {
      if (vistosEsteSync.has(id)) continue;
      if (deprecatedAt != null) continue;
      aDepreciar.push(id);
    }
    if (aDepreciar.length > 0) {
      await prisma.llmModelEntry.updateMany({
        where: { id: { in: aDepreciar } },
        data: { deprecatedAt: new Date() },
      });
      out.depreciados.push(...aDepreciar);
    }
  } catch (err) {
    out.erro = err instanceof Error ? err.message : "Falha na sincronização.";
  }
  return out;
}
