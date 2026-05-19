"use server";

/**
 * Server Actions para gerenciamento de credenciais LLM.
 *
 * Wrappa as funções de credentials.ts para uso em Client Components,
 * adicionando gate de autenticação (admin/super_admin).
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  createCredential,
  deleteCredential,
  listCredentials,
} from "@/lib/agent/llm/credentials";
import type { CredentialSummary } from "@/lib/agent/llm/credentials";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { ActionResult } from "@/lib/actions/users";

async function requireAdminOrAbove(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado — requer perfil admin ou super_admin" };
  }
  return { ok: true, userId: me.id };
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
    revalidatePath("/agente/configuracao");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao criar credencial",
    };
  }
}

export async function deleteCredentialAction(id: string): Promise<ActionResult> {
  try {
    const auth = await requireAdminOrAbove();
    if (!auth.ok) return { success: false, error: auth.error };

    await deleteCredential(id, auth.userId);
    revalidatePath("/agente/configuracao");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao remover credencial",
    };
  }
}

export async function listCredentialsAction(): Promise<ActionResult<CredentialSummary[]>> {
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
