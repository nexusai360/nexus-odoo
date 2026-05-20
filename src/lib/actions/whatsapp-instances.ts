"use server";

/**
 * Server Actions de Instâncias de WhatsApp (#30 — Integrações/Canais).
 *
 * Cada instância representa um número/conta Meta separado, com modo de
 * resposta próprio (direct ou n8n_webhook). Tabela `whatsapp_instances`
 * criada em 20260519210235_f5_r6_schema.
 *
 * Gate: super_admin (canais sensíveis com credenciais Meta).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/users";

export interface WhatsappInstanceItem {
  id: string;
  name: string;
  phoneNumber: string;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  responseMode: "direct" | "n8n_webhook";
  hasToken: boolean;
  enabled: boolean;
  webhookId: string | null;
  createdAt: string;
  updatedAt: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado — requer super_admin" };
  }
  return { ok: true, userId: me.id };
}

export async function listWhatsappInstances(): Promise<
  ActionResult<WhatsappInstanceItem[]>
> {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const rows = await prisma.whatsappInstance.findMany({
      orderBy: { createdAt: "asc" },
    });
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phoneNumber: r.phoneNumber,
        businessAccountId: r.businessAccountId,
        phoneNumberId: r.phoneNumberId,
        responseMode: r.responseMode as "direct" | "n8n_webhook",
        hasToken: Boolean(r.graphApiToken),
        enabled: r.enabled,
        webhookId: r.webhookId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[listWhatsappInstances]", err);
    return { success: false, error: "Erro ao listar instâncias" };
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  phoneNumber: z.string().min(8).max(40),
  businessAccountId: z.string().max(64).optional().nullable(),
  phoneNumberId: z.string().max(64).optional().nullable(),
  graphApiToken: z.string().max(2000).optional().nullable(),
  responseMode: z.enum(["direct", "n8n_webhook"]).default("direct"),
});

export async function createWhatsappInstance(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Dados inválidos" };
    }
    const d = parsed.data;

    const created = await prisma.whatsappInstance.create({
      data: {
        name: d.name.trim(),
        phoneNumber: d.phoneNumber.trim(),
        businessAccountId: d.businessAccountId?.trim() || null,
        phoneNumberId: d.phoneNumberId?.trim() || null,
        graphApiToken: d.graphApiToken ? encrypt(d.graphApiToken) : null,
        responseMode: d.responseMode,
        enabled: true,
      },
      select: { id: true },
    });

    void logAudit({
      userId: auth.userId,
      action: "whatsapp_channel_updated",
      targetType: "WhatsappInstance",
      targetId: created.id,
      details: { kind: "create", name: d.name },
    });

    revalidatePath("/integracoes/canais");
    return { success: true, data: { id: created.id } };
  } catch (err) {
    console.error("[createWhatsappInstance]", err);
    return { success: false, error: "Erro ao criar instância" };
  }
}

export async function toggleWhatsappInstance(input: {
  id: string;
  enabled: boolean;
}): Promise<ActionResult> {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!input.id) return { success: false, error: "id obrigatório" };

    await prisma.whatsappInstance.update({
      where: { id: input.id },
      data: { enabled: input.enabled },
    });

    void logAudit({
      userId: auth.userId,
      action: "whatsapp_channel_updated",
      targetType: "WhatsappInstance",
      targetId: input.id,
      details: { kind: "toggle", enabled: input.enabled },
    });

    revalidatePath("/integracoes/canais");
    return { success: true };
  } catch (err) {
    console.error("[toggleWhatsappInstance]", err);
    return { success: false, error: "Erro ao alterar status" };
  }
}

export async function deleteWhatsappInstance(
  id: string,
): Promise<ActionResult> {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!id) return { success: false, error: "id obrigatório" };

    await prisma.whatsappInstance.delete({ where: { id } });

    void logAudit({
      userId: auth.userId,
      action: "whatsapp_channel_updated",
      targetType: "WhatsappInstance",
      targetId: id,
      details: { kind: "delete" },
    });

    revalidatePath("/integracoes/canais");
    return { success: true };
  } catch (err) {
    console.error("[deleteWhatsappInstance]", err);
    return { success: false, error: "Erro ao excluir instância" };
  }
}
