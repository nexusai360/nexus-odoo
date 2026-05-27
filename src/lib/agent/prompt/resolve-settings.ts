/**
 * Função CANÔNICA de leitura do AgentSettings.
 *
 * Respeita a flag `usesCodeDefaults` — quando true (default), os campos
 * de prompt (identityBase/personality/tone/guardrails) são lidos do
 * CÓDIGO (IDENTITY_BASE, DEFAULT_PERSONALITY, DEFAULT_TONE,
 * DEFAULT_GUARDRAILS) em vez do banco.
 *
 * **TODOS os call sites do projeto devem usar esta função** em vez de ler
 * direto via `prisma.agentSettings.findUnique`. Isso resolve o drift
 * dev/banco em definitivo: dev edita o código, mudança REFLETE
 * imediatamente em produção, agente, playground, prompt-preview, judges,
 * worker — sem precisar UPDATE manual no banco.
 *
 * Quando admin SALVA via UI `/agente/prompt`, a flag vira false e o
 * banco vira fonte. Pra voltar pro default do código, usar a action
 * `resetAgentSettingsToCodeDefaults` (botão "Voltar ao padrão" na UI).
 */

import { prisma } from "@/lib/prisma";
import { IDENTITY_BASE } from "@/lib/agent/prompt/identity-base";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_TONE,
  DEFAULT_GUARDRAILS,
} from "@/lib/agent/prompt/defaults";

export interface ResolvedAgentSettings {
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  kbEnabled: boolean;
  terminology: Record<string, string>;
  suggestionsEnabled: boolean;
  usesCodeDefaults: boolean;
  reasoningEffort: string | null;
  /** kb_checkpoint raw pra quem precisa diferenciar PLAYGROUND/PRODUCTION */
  kbCheckpoint: string;
}

export async function resolveAgentSettings(): Promise<ResolvedAgentSettings> {
  const row = await prisma.agentSettings.findUnique({
    where: { id: "global" },
  });
  const useCode = row?.usesCodeDefaults ?? true;
  return {
    identityBase: useCode ? IDENTITY_BASE : (row?.identityBase ?? null),
    personality: useCode ? DEFAULT_PERSONALITY : (row?.personality ?? ""),
    tone: useCode ? DEFAULT_TONE : (row?.tone ?? ""),
    guardrails: useCode
      ? DEFAULT_GUARDRAILS
      : ((row?.guardrails as string[]) ?? []),
    advancedOverride: row?.advancedOverride ?? null,
    kbEnabled: (row?.kbCheckpoint ?? "PRODUCTION") === "PRODUCTION",
    kbCheckpoint: row?.kbCheckpoint ?? "PRODUCTION",
    terminology: (row?.terminology as Record<string, string>) ?? {},
    suggestionsEnabled: row?.suggestionsEnabled ?? true,
    usesCodeDefaults: useCode,
    reasoningEffort: row?.reasoningEffort ?? null,
  };
}
