/**
 * Sincronização do catálogo de modelos a partir da API do provedor.
 *
 * Consulta a API de listagem do provedor, compara com o catálogo efetivo
 * (base do `catalog.ts` + tabela `llm_model_entry`) e faz upsert dos modelos
 * novos / atualizações na tabela. Preço: OpenRouter expõe na API; OpenAI/
 * Anthropic/Gemini não — para esses, modelos novos entram com `pricing: null`
 * (sinalizados para curadoria manual).
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { MODELS, type LlmProvider } from "./catalog";

export interface SyncResult {
  provider: LlmProvider;
  novos: string[];
  atualizados: string[];
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

async function fetchOpenRouter(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter listing failed: ${res.status}`);
  const data = (await res.json()) as {
    data: Array<{
      id: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };
  return data.data.map((m) => ({
    id: m.id,
    label: m.name ?? m.id,
    pricingInput: m.pricing?.prompt
      ? Number(m.pricing.prompt) * 1_000_000
      : null,
    pricingOutput: m.pricing?.completion
      ? Number(m.pricing.completion) * 1_000_000
      : null,
  }));
}

function deriveTier(input: number | null, output: number | null): string {
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
  const out: SyncResult = { provider, novos: [], atualizados: [] };
  try {
    let fetched: FetchedModel[] = [];
    if (provider === "openai") fetched = await fetchOpenAI(apiKey);
    else if (provider === "openrouter") fetched = await fetchOpenRouter(apiKey);
    else {
      out.erro = `Sincronização para ${provider} ainda não implementada.`;
      return out;
    }

    const knownBase = new Set(
      MODELS.filter((m) => m.provider === provider).map((m) => m.id),
    );
    const overrides = await prisma.llmModelEntry.findMany({
      where: { provider },
      select: { id: true },
    });
    const knownOverride = new Set(overrides.map((o) => o.id));

    for (const m of fetched) {
      const inBase = knownBase.has(m.id);
      const inOverride = knownOverride.has(m.id);
      if (inBase) continue; // base versionada vence — não duplica
      const tier = deriveTier(m.pricingInput, m.pricingOutput);
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
        },
      });
      if (inOverride) out.atualizados.push(m.id);
      else out.novos.push(m.id);
    }
  } catch (err) {
    out.erro = err instanceof Error ? err.message : "Falha na sincronização.";
  }
  return out;
}
