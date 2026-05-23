"use server";

/**
 * Server Action do botão "atualizar" no cabeçalho Modelo. Consulta a API do
 * provedor selecionado, faz upsert dos modelos novos/atualizações em
 * `LlmModelEntry`, e retorna um resumo. Gate: super_admin/admin.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { syncProvider } from "@/lib/agent/llm/sync-catalog";
import { prisma } from "@/lib/prisma";
import { getDecryptedKey } from "@/lib/agent/llm/credentials";
import type { LlmProvider } from "@/lib/agent/llm/types";

export interface SyncModelsResult {
  success: boolean;
  novos?: string[];
  atualizados?: string[];
  ignoradosWhitelist?: string[];
  ignoradosSemPricing?: string[];
  depreciados?: string[];
  revividos?: string[];
  error?: string;
}

export async function syncProviderModels(
  provider: LlmProvider,
): Promise<SyncModelsResult> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado." };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { success: false, error: "Acesso negado." };
  }
  // Pega a primeira credencial cadastrada do provedor
  const cred = await prisma.llmCredential.findFirst({
    where: { provider },
    orderBy: { createdAt: "asc" },
  });
  if (!cred) {
    return {
      success: false,
      error: `Cadastre uma chave de API de ${provider} antes de atualizar.`,
    };
  }
  const apiKey = await getDecryptedKey(cred.id);
  if (!apiKey) {
    return { success: false, error: "Não foi possível decifrar a chave." };
  }
  const result = await syncProvider(provider, apiKey);
  if (result.erro) return { success: false, error: result.erro };
  revalidatePath("/agente/configuracao");
  return {
    success: true,
    novos: result.novos,
    atualizados: result.atualizados,
    ignoradosWhitelist: result.ignoradosWhitelist,
    ignoradosSemPricing: result.ignoradosSemPricing,
    depreciados: result.depreciados,
    revividos: result.revividos,
  };
}
