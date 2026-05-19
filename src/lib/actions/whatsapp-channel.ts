"use server";

/**
 * Server Actions para gerenciamento do canal WhatsApp (credenciais Meta).
 *
 * Gate: apenas `super_admin` pode ler ou atualizar.
 * Token da Graph API é cifrado com AES-256-GCM antes de gravar no banco.
 * Auditoria em toda atualização.
 *
 * SPEC §6.4.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, decrypt, mask } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/users";

/** Schema de atualização do canal WhatsApp. */
const updateSchema = z.object({
  apiToken: z.string().min(1).optional(),
  businessAccountId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  responseMode: z.enum(["direct", "n8n_webhook"]),
  enabled: z.boolean(),
});

export type UpdateWhatsappChannelInput = z.input<typeof updateSchema>;

export interface WhatsappChannelData {
  /** Token mascarado (ex.: "••••abc12"). null se ainda não configurado. */
  maskedApiToken: string | null;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  responseMode: "direct" | "n8n_webhook";
  enabled: boolean;
  updatedAt: Date | null;
}

/** Verifica se o usuário tem permissão de gerenciar o canal WhatsApp. */
function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

// ──────────────────────────────────────────────────────────────────────────────
// getWhatsappChannel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retorna os dados do canal WhatsApp com o token mascarado.
 * Gate: super_admin.
 */
export async function getWhatsappChannel(): Promise<ActionResult<WhatsappChannelData>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    const channel = await prisma.whatsappChannel.findUnique({ where: { id: "global" } });

    if (!channel) {
      return {
        success: true,
        data: {
          maskedApiToken: null,
          businessAccountId: null,
          phoneNumberId: null,
          responseMode: "direct",
          enabled: false,
          updatedAt: null,
        },
      };
    }

    let maskedApiToken: string | null = null;
    if (channel.encryptedApiToken) {
      try {
        const plain = decrypt(channel.encryptedApiToken);
        maskedApiToken = mask(plain);
      } catch {
        maskedApiToken = "••••••••(erro ao decifrar)";
      }
    }

    return {
      success: true,
      data: {
        maskedApiToken,
        businessAccountId: channel.businessAccountId,
        phoneNumberId: channel.phoneNumberId,
        responseMode: channel.responseMode,
        enabled: channel.enabled,
        updatedAt: channel.updatedAt,
      },
    };
  } catch (err) {
    console.error("[whatsapp-channel] getWhatsappChannel:", err);
    return { success: false, error: "Erro interno ao carregar canal WhatsApp" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// updateWhatsappChannel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Atualiza (ou cria) as configurações do canal WhatsApp.
 * Cifra o apiToken antes de gravar, se fornecido.
 * Gate: super_admin.
 */
export async function updateWhatsappChannel(
  input: UpdateWhatsappChannelInput,
): Promise<ActionResult<void>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dados inválidos: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const { apiToken, businessAccountId, phoneNumberId, responseMode, enabled } = parsed.data;

  try {
    // Monta o payload de atualização
    const updateData: Record<string, unknown> = {
      businessAccountId,
      phoneNumberId,
      responseMode,
      enabled,
    };

    // Só atualiza o token se foi fornecido
    if (apiToken) {
      updateData.encryptedApiToken = encrypt(apiToken);
    }

    await prisma.whatsappChannel.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        ...updateData,
      },
      update: updateData,
    });

    await logAudit({
      userId: me.id,
      action: "whatsapp_channel_updated",
      targetType: "whatsapp_channel",
      targetId: "global",
      details: {
        responseMode,
        enabled,
        tokenUpdated: !!apiToken,
      },
    });

    revalidatePath("/integracoes");

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[whatsapp-channel] updateWhatsappChannel:", err);
    return { success: false, error: "Erro interno ao atualizar canal WhatsApp" };
  }
}
