"use server";

/**
 * Helpers compartilhados por server actions que exigem super_admin.
 */

import { auth } from "@/auth";

/**
 * Garante que a sessão ativa pertence a um super_admin.
 * Lança um erro descriptivo caso contrário — o caller deve capturar e
 * devolver { success: false, error: "..." } ao cliente.
 */
export async function requireSuperAdmin(): Promise<{ id: string; platformRole: string }> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; platformRole?: string }
    | undefined;

  if (!user?.id) {
    throw new Error("Não autenticado");
  }
  if (user.platformRole !== "super_admin") {
    throw new Error("Acesso negado — requer super_admin");
  }
  return { id: user.id, platformRole: user.platformRole };
}
