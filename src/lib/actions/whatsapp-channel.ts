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
import { fetchDisplayPhoneNumber } from "@/lib/whatsapp/cloud-client";
import { verificarNumeroParaCanalDireto } from "@/lib/whatsapp/numero-unico";
import { normalizeE164 } from "@/lib/whatsapp/resolve";
type DataResult<T> = { success: true; data: T } | { success: false; error: string };

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
export async function getWhatsappChannel(): Promise<DataResult<WhatsappChannelData>> {
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
): Promise<DataResult<void>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dados inválidos: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const { apiToken, businessAccountId, phoneNumberId, responseMode, enabled } = parsed.data;

  try {
    // ── Trava de número único (SPEC §3.4.1) ─────────────────────────────────
    // `phoneNumberId` é um ID da Meta, não o telefone: para a trava ser
    // comparável com as Conexões por webhook, o telefone real é resolvido na
    // Graph API e gravado junto. Fail-closed: sem resolver, não salva.
    let tokenParaGraph = apiToken ?? null;
    if (!tokenParaGraph) {
      const atual = await prisma.whatsappChannel
        .findUnique({ where: { id: "global" }, select: { encryptedApiToken: true } })
        .catch(() => null);
      if (atual?.encryptedApiToken) {
        try {
          tokenParaGraph = decrypt(atual.encryptedApiToken);
        } catch {
          tokenParaGraph = null;
        }
      }
    }
    if (!tokenParaGraph) {
      return {
        success: false,
        error: "Informe o token da Graph API para validar o número deste canal.",
      };
    }

    let displayPhoneNumber: string;
    try {
      displayPhoneNumber = await fetchDisplayPhoneNumber({
        apiToken: tokenParaGraph,
        phoneNumberId,
      });
    } catch (err) {
      console.error("[whatsapp-channel] resolução do número falhou:", err);
      return {
        success: false,
        error:
          "Não foi possível confirmar o número deste canal na Meta. " +
          "Confira o token e o ID do número e tente de novo. Sem essa confirmação, a configuração não é salva.",
      };
    }

    const trava = await verificarNumeroParaCanalDireto(displayPhoneNumber);
    if (!trava.ok) {
      return { success: false, error: trava.error };
    }

    let phoneNumber: string;
    try {
      phoneNumber = normalizeE164(displayPhoneNumber);
    } catch {
      return {
        success: false,
        error: "A Meta retornou um número em formato inesperado. A configuração não foi salva.",
      };
    }

    // Monta o payload de atualização
    const updateData: Record<string, unknown> = {
      businessAccountId,
      phoneNumberId,
      phoneNumber,
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
