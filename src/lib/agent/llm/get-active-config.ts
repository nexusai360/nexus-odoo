/**
 * Leitura da configuração LLM ativa do banco.
 *
 * Portado de nexus-insights/src/lib/llm/get-active-config.ts.
 * Adaptações: usa Prisma v7 + model LlmConfig/LlmCredential da F5.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import type { LlmProvider } from "./types";

export interface ActiveLlmConfig {
  id: string;
  provider: LlmProvider;
  model: string;
  /** API key descriptografada , manter em memória, nunca expor pela rede. */
  apiKey: string;
  credentialId: string | null;
  credentialLabel: string | null;
}

export interface PublicLlmConfig {
  id: string;
  provider: LlmProvider;
  model: string;
  credentialId: string | null;
  credentialLabel: string | null;
  last4: string | null;
}

const VALID_PROVIDERS = new Set<LlmProvider>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);

/** Retorna a config LLM ativa com a chave descriptografada, ou null. */
export async function getActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  const row = await prisma.llmConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    include: {
      credential: {
        select: {
          encryptedApiKey: true,
          label: true,
          last4: true,
        },
      },
    },
  });

  if (!row) return null;
  if (!VALID_PROVIDERS.has(row.provider as LlmProvider)) return null;

  if (!row.credential) {
    throw new Error(
      `Config LLM ativa (id=${row.id}) está sem credencial , configure uma API key.`,
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt(row.credential.encryptedApiKey);
  } catch {
    throw new Error("Falha ao decifrar a API key da config LLM ativa.");
  }

  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    model: row.model,
    apiKey,
    credentialId: row.credentialId ?? null,
    credentialLabel: row.credential.label,
  };
}

/** Retorna a config LLM ativa mascarada (sem API key), ou null. */
export async function getPublicActiveLlmConfig(): Promise<PublicLlmConfig | null> {
  const row = await prisma.llmConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    include: {
      credential: {
        select: { label: true, last4: true },
      },
    },
  });

  if (!row) return null;
  if (!VALID_PROVIDERS.has(row.provider as LlmProvider)) return null;

  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    model: row.model,
    credentialId: row.credentialId ?? null,
    credentialLabel: row.credential?.label ?? null,
    last4: row.credential?.last4 ?? null,
  };
}
