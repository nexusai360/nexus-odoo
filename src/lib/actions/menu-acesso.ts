"use server";
// src/lib/actions/menu-acesso.ts
// Server action da feature "Acesso aos menus" (tela Configuracao, super_admin).
// Grava o nivel de um menu e revalida a UI + o sidebar.
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { definirMenuAccess } from "@/lib/nav/menu-access";
import type { MenuKey } from "@/lib/nav/menu-catalog";
import type { ChannelAccessLevel } from "@/generated/prisma/client";

export async function salvarMenuAccess(
  menuKey: MenuKey,
  level: ChannelAccessLevel,
): Promise<{ ok: boolean; level?: ChannelAccessLevel; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    return { ok: false, error: "Sem permissão." };
  }
  try {
    const efetivo = await definirMenuAccess(menuKey, level);
    // revalida a tela e o layout (sidebar lê o acesso no server)
    revalidatePath("/configuracao");
    revalidatePath("/", "layout");
    return { ok: true, level: efetivo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}
