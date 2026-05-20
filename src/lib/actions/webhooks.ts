"use server";

/**
 * Server Actions para gerenciamento de webhooks (inbound/outbound).
 *
 * Gate: apenas `super_admin` pode criar, listar, rotacionar, habilitar/desabilitar e deletar.
 * O secret é cifrado com AES-256-GCM antes de gravar no banco.
 * Ao criar ou rotacionar, o secret em claro é retornado 1× para exibição
 * (`SecretRevealStep`).
 *
 * SPEC §4.5 / §7.3.3 e §9.
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

/** Direção do webhook — valores do enum Prisma `WebhookDirection`. */
export type WebhookDirection = "inbound" | "outbound";

/** Métodos HTTP aceitos por um webhook. */
export type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CreateWebhookInput {
  direction: WebhookDirection;
  name: string;
  /** Caminho (slug) — somente inbound. */
  path?: string | null;
  /** URL de destino completa — somente outbound. */
  targetUrl?: string | null;
  methods: WebhookMethod[];
}

export interface WebhookListItem {
  id: string;
  direction: WebhookDirection;
  name: string | null;
  path: string | null;
  targetUrl: string | null;
  methods: string[];
  enabled: boolean;
  createdAt: Date;
}

export interface CreatedWebhook {
  id: string;
  direction: WebhookDirection;
  name: string | null;
  path: string | null;
  targetUrl: string | null;
  methods: string[];
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

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Slug seguro para o path de um webhook de entrada. */
const pathSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-/]*$/, "Caminho inválido");

const createSchema = z
  .object({
    direction: z.enum(["inbound", "outbound"]),
    name: z.string().trim().min(1, "Nome obrigatório"),
    path: z.string().nullable().optional(),
    targetUrl: z.string().nullable().optional(),
    methods: z.array(methodSchema).min(1, "Selecione ao menos um método"),
  })
  .superRefine((val, ctx) => {
    if (val.direction === "inbound") {
      const parsed = pathSchema.safeParse(val.path ?? "");
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message: "Caminho inválido para webhook de entrada",
        });
      }
    } else {
      const parsed = z.string().url().safeParse(val.targetUrl ?? "");
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetUrl"],
          message: "URL de destino inválida",
        });
      }
    }
  });

// ──────────────────────────────────────────────────────────────────────────────
// createWebhook
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cria um novo webhook (inbound ou outbound).
 * Retorna o secret em claro uma única vez (para o `SecretRevealStep`).
 * Gate: super_admin.
 */
export async function createWebhook(
  input: CreateWebhookInput,
): Promise<DataResult<CreatedWebhook>> {
  const me = await getCurrentUser();
  if (!me) return { success: false, error: "Não autenticado" };
  if (!isSuperAdmin(me.platformRole)) return { success: false, error: "Acesso negado" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const data = parsed.data;
  const secretPlain = generateSecret();
  const secretEncrypted = encrypt(secretPlain);

  try {
    const created = await prisma.whatsappWebhook.create({
      data: {
        direction: data.direction,
        name: data.name,
        path: data.direction === "inbound" ? (data.path ?? null) : null,
        targetUrl: data.direction === "outbound" ? (data.targetUrl ?? null) : null,
        url: data.direction === "outbound" ? (data.targetUrl ?? null) : null,
        methods: data.methods,
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
        name: created.name,
        path: created.path,
        targetUrl: created.targetUrl,
        methods: created.methods,
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
      name: r.name,
      path: r.path,
      targetUrl: r.targetUrl ?? r.url,
      methods: r.methods,
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
