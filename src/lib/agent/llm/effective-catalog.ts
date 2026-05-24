/**
 * Catálogo efetivo = base versionada (catalog.ts) + overrides do banco
 * (LlmModelEntry). Banco vazio = só base.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  MODELS,
  isLegacyModel,
  sortModels,
  sortOpenrouterModels,
  type CostTier,
  type LlmProvider,
  type ModelEntry,
  type ModelUse,
  type ReasoningLevel,
} from "./catalog";

function rowToModelEntry(row: {
  id: string;
  provider: string;
  label: string;
  tier: string;
  pricingInput: number | null;
  pricingOutput: number | null;
  pricingPerMinute: number | null;
  modelUse: string | null;
  audio: boolean;
  vision: boolean;
  reasoningLevels: unknown;
  released: string | null;
  notes: string | null;
  deprecatedAt: Date | null;
}): ModelEntry {
  const pricing =
    row.pricingInput == null && row.pricingOutput == null
      ? null
      : {
          inputPerMTok: row.pricingInput ?? 0,
          outputPerMTok: row.pricingOutput ?? 0,
          ...(row.pricingPerMinute != null
            ? { perMinuteUsd: row.pricingPerMinute }
            : {}),
        };
  const reasoning = Array.isArray(row.reasoningLevels)
    ? { levels: row.reasoningLevels as ReasoningLevel[] }
    : undefined;
  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    label: row.label,
    tier: row.tier as CostTier,
    pricing,
    use: (row.modelUse as ModelUse | null) ?? undefined,
    audio: row.audio,
    vision: row.vision,
    released: row.released ?? undefined,
    notes: row.notes ?? undefined,
    reasoning,
    deprecated: row.deprecatedAt != null,
  };
}

/**
 * Modelos efetivos de um provedor (base + overrides), ordenados.
 * Por padrão filtra legados (pré-2024, exceto áudio); use
 * `{ includeLegacy: true }` para incluir.
 */
export async function loadEffectiveModelsByProvider(
  provider: LlmProvider,
  opts: { includeLegacy?: boolean } = {},
): Promise<ModelEntry[]> {
  const base = MODELS.filter((m) => m.provider === provider);
  const baseIds = new Set(base.map((m) => m.id));
  const overrides = await prisma.llmModelEntry.findMany({
    where: { provider },
  });
  const extras: ModelEntry[] = [];
  for (const row of overrides) {
    if (baseIds.has(row.id)) continue; // base versionada vence
    extras.push(rowToModelEntry(row));
  }
  const all = [...base, ...extras];
  const filtered = opts.includeLegacy ? all : all.filter((m) => !isLegacyModel(m));
  return provider === "openrouter"
    ? sortOpenrouterModels(filtered)
    : sortModels(filtered);
}
