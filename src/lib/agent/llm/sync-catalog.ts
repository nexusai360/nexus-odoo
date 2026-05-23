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
      if (inBase) {
        // Base versionada vence: nao duplica entrada no banco.
        continue;
      }
      const tier = deriveTier(m.pricingInput, m.pricingOutput);
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
