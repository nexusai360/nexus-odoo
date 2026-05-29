/**
 * R2-ctx: resolve a credencial/modelo da LLM de "Construção da pergunta"
 * (Camada 2 do router contextual).
 *
 * Precedência:
 *  1. Config dedicada em AgentSettings (routerReformProvider/Model/CredentialId).
 *  2. Fallback: LLM ativo do projeto (getActiveLlmConfig), como o sugeridor faz.
 *  3. null quando nada disponível (o caller pula a Camada 2).
 */

import "server-only";

import { getDecryptedKey } from "@/lib/agent/llm/credentials";
import { getActiveLlmConfig } from "@/lib/agent/llm/get-active-config";

export interface ReformLlm {
  provider: string;
  apiKey: string;
  model: string;
  credentialId?: string | null;
}

export async function resolveReformLlm(settings: {
  routerReformProvider: string | null;
  routerReformModel: string | null;
  routerReformCredentialId: string | null;
}): Promise<ReformLlm | null> {
  if (
    settings.routerReformProvider &&
    settings.routerReformModel &&
    settings.routerReformCredentialId
  ) {
    const apiKey = await getDecryptedKey(settings.routerReformCredentialId);
    if (apiKey) {
      return {
        provider: settings.routerReformProvider,
        model: settings.routerReformModel,
        apiKey,
        credentialId: settings.routerReformCredentialId,
      };
    }
  }

  const active = await getActiveLlmConfig();
  if (!active) return null;
  return {
    provider: active.provider,
    model: active.model,
    apiKey: active.apiKey,
    credentialId:
      (active as { credentialId?: string | null }).credentialId ?? null,
  };
}
