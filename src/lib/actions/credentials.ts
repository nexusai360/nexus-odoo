"use server";

/**
 * Server Actions para gerenciamento de credenciais LLM.
 *
 * Wrappa as funções de `agent/llm/credentials.ts` para uso em Client
 * Components, adicionando gate de autenticação (admin/super_admin).
 *
 * Rework F5-UI v2: acrescenta renomear/trocar chave, consulta de saldo da
 * conta do provedor e teste de conexão.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  createCredential,
  deleteCredential,
  listCredentials,
  updateCredential,
  refreshCredentialBalance,
  getDecryptedKey,
} from "@/lib/agent/llm/credentials";
import type {
  CredentialSummary,
  CredentialBalance,
} from "@/lib/agent/llm/credentials";
import {
  deepTest,
  describeErrorKind,
  type DeepTestResult,
} from "@/lib/agent/llm/providers/test-connection";
import { listModels } from "@/lib/agent/llm/catalog";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { ActionResult } from "@/lib/actions/users";

async function requireAdminOrAbove(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Acesso negado , requer perfil admin ou super_admin",
    };
  }
  return { ok: true, userId: me.id };
}

function revalidateCredentialPaths(): void {
  revalidatePath("/agente/configuracao");
  revalidatePath("/agente/chaves");
}

export async function createCredentialAction(input: {
  provider: LlmProvider;
  label: string;
  apiKey: string;
}): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await createCredential(input, auth.userId);
    revalidateCredentialPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao criar credencial",
    };
  }
}

export async function updateCredentialAction(
  id: string,
  input: { label?: string; apiKey?: string },
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await updateCredential(id, input, auth.userId);
    revalidateCredentialPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro ao atualizar credencial",
    };
  }
}

export async function deleteCredentialAction(
  id: string,
): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await deleteCredential(id, auth.userId);
    revalidateCredentialPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao remover credencial",
    };
  }
}

export async function listCredentialsAction(): Promise<
  ActionResult<CredentialSummary[]>
> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const data = await listCredentials();
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao listar credenciais",
    };
  }
}

/**
 * Consulta o saldo da conta do provedor para uma chave e persiste o resultado.
 * Acionado pelo botão de atualizar saldo na tela Chaves de API.
 */
export async function refreshCredentialBalanceAction(
  id: string,
): Promise<ActionResult<CredentialBalance | null>> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const balance = await refreshCredentialBalance(id);
    revalidateCredentialPaths();
    return { success: true, data: balance };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao consultar saldo",
    };
  }
}

export interface TestConnectionData {
  reachable: boolean;
  message?: string;
  creditOk?: boolean;
}

/**
 * Testa a conexão de uma chave de API contra um modelo do provedor.
 * Quando `model` é omitido, usa o modelo mais recente do catálogo.
 */
export async function testCredentialConnectionAction(
  credentialId: string,
  provider: LlmProvider,
  model?: string,
): Promise<ActionResult<TestConnectionData>> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    const apiKey = await getDecryptedKey(credentialId);
    if (!apiKey) {
      return { success: false, error: "Chave não encontrada ou inválida" };
    }

    const resolvedModel = model?.trim() || listModels(provider)[0]?.id;
    if (!resolvedModel) {
      return { success: false, error: "Nenhum modelo disponível para teste" };
    }

    const result: DeepTestResult = await deepTest(
      provider,
      apiKey,
      resolvedModel,
    );

    const message =
      describeErrorKind(result.errorKind, result.message, resolvedModel) ??
      result.message;

    return {
      success: true,
      data: {
        reachable: result.reachable,
        creditOk: result.creditOk,
        message,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao testar conexão",
    };
  }
}
