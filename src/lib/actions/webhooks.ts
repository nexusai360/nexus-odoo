"use server";

/**
 * Server Actions para gerenciamento de webhooks (inbound/outbound).
 *
 * Gate: apenas `super_admin` pode criar, listar, rotacionar, habilitar/desabilitar e deletar.
 * O secret é cifrado com AES-256-GCM antes de gravar no banco.
 * Ao criar ou rotacionar, o secret em claro é retornado 1× para exibição.
 *
 * SPEC §7.3.3 e §9.
 */

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

export type WebhookDirection = "inbound" | "outbound";

export interface WebhookListItem {
  id: string;
  direction: WebhookDirection;
  url: string | null;
  enabled: boolean;
  createdAt: Date;
}

export interface CreatedWebhook {
  id: string;
  direction: WebhookDirection;
  url: string | null;
  enabled: boolean;
  secretPlain: string; // retornado 1× na criação
}

export interface RotatedWebhookSecret {
  secretPlain: string; // retornado 1× na rotação
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

// ──────────────────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────────────────

const directionSchema = z.enum(["inbound", "outbound"]);

const createSchema = z.object({
  direction: directionSchema,
  url: z.string().url().nullable().optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
// createWebhook
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cria um novo webhook (inbound ou outbound).
 * Retorna o secret em claro uma única vez.
 * Gate: super_admin.
 */
export async function createWebhook(
  direction: string,
  url: string | null | undefined,
): Promise<DataResult<CreatedWebhook>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const parsed = createSchema.safeParse({ direction, url });
  if (!parsed.success) {
    return { success: false, error: "Dados inválidos" };
  }

  const secretPlain = generateSecret();
  const secretEncrypted = encrypt(secretPlain);

  try {
    const created = await prisma.whatsappWebhook.create({
      data: {
        direction: parsed.data.direction,
        url: parsed.data.url ?? null,
        secret: secretEncrypted,
        enabled: true,
      },
    });

    revalidatePath("/integracoes/webhooks");

    return {
      success: true,
      data: {
        id: created.id,
        direction: created.direction as WebhookDirection,
        url: created.url,
        enabled: created.enabled,
        secretPlain,
      },
    };
  } catch (err) {
    console.error("[webhooks] createWebhook error:", err);
    return { success: false, error: "Erro ao criar webhook" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// listWebhooks
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lista todos os webhooks sem expor o secret.
 * Gate: super_admin.
 */
export async function listWebhooks(): Promise<DataResult<WebhookListItem[]>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    const rows = await prisma.whatsappWebhook.findMany({
      orderBy: { createdAt: "desc" },
    });

    const data: WebhookListItem[] = rows.map((r) => ({
      id: r.id,
      direction: r.direction as WebhookDirection,
      url: r.url,
      enabled: r.enabled,
      createdAt: r.createdAt,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("[webhooks] listWebhooks error:", err);
    return { success: false, error: "Erro ao listar webhooks" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// rotateWebhookSecret
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Gera um novo secret para o webhook e o retorna em claro uma única vez.
 * Gate: super_admin.
 */
export async function rotateWebhookSecret(
  id: string,
): Promise<DataResult<RotatedWebhookSecret>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const secretPlain = generateSecret();
  const secretEncrypted = encrypt(secretPlain);

  try {
    await prisma.whatsappWebhook.update({
      where: { id },
      data: { secret: secretEncrypted },
    });

    revalidatePath("/integracoes/webhooks");

    return { success: true, data: { secretPlain } };
  } catch (err) {
    console.error("[webhooks] rotateWebhookSecret error:", err);
    return { success: false, error: "Erro ao rotacionar secret" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// toggleWebhook
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Habilita ou desabilita um webhook.
 * Gate: super_admin.
 */
export async function toggleWebhook(
  id: string,
  enabled: boolean,
): Promise<DataResult<void>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    await prisma.whatsappWebhook.update({
      where: { id },
      data: { enabled },
    });

    revalidatePath("/integracoes/webhooks");

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[webhooks] toggleWebhook error:", err);
    return { success: false, error: "Erro ao atualizar webhook" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteWebhook
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Remove um webhook permanentemente.
 * Gate: super_admin.
 */
export async function deleteWebhook(id: string): Promise<DataResult<void>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  try {
    await prisma.whatsappWebhook.delete({ where: { id } });

    revalidatePath("/integracoes/webhooks");

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[webhooks] deleteWebhook error:", err);
    return { success: false, error: "Erro ao deletar webhook" };
  }
}
