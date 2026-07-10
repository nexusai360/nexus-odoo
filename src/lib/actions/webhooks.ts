"use server";

/**
 * Server Actions para gerenciamento de webhooks (inbound/outbound).
 *
 * Gate: quem enxerga o menu Integrações gerencia os webhooks comuns. O webhook
 * "Receber mensagens do WhatsApp" (o que alimenta o Agente Nex) é EXCLUSIVO do
 * super_admin, em todas as operações. Ver src/lib/integrations/webhook-permissions.ts.
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
import type { AuthUser } from "@/lib/auth-helpers";
import { obterMenuAccess } from "@/lib/nav/menu-access";
import {
  podeGerenciarWebhooks,
  podeGerenciarWhatsappWebhook,
} from "@/lib/integrations/webhook-permissions";
import { encrypt, decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

/** Direção do webhook, valores do enum Prisma `WebhookDirection`. */
export type WebhookDirection = "inbound" | "outbound";

/** Métodos HTTP aceitos por um webhook. */
export type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

/** Eventos emissíveis por um webhook de saída (enum Prisma `WebhookEvent`). */
export type WebhookEventName = "agent_reply";

export interface CreateWebhookInput {
  direction: WebhookDirection;
  name: string;
  /** Descrição livre do que o webhook faz (F5.1). */
  description?: string | null;
  /** Caminho (slug), somente inbound. */
  path?: string | null;
  /** URL de destino completa, somente outbound. */
  targetUrl?: string | null;
  methods: WebhookMethod[];
  /** Eventos emitidos, somente outbound (default ["agent_reply"]). */
  events?: WebhookEventName[];
  /** F5.1: inbound que recebe dados de WhatsApp e alimenta o agente. */
  isWhatsappReceiver?: boolean;
  /** F5.1: número da empresa (obrigatório/único quando isWhatsappReceiver). */
  businessId?: string | null;
}

export interface UpdateWebhookInput {
  name: string;
  /** Descrição livre do que o webhook faz (F5.1). */
  description?: string | null;
  /** Caminho (slug), somente inbound. */
  path?: string | null;
  /** URL de destino completa, somente outbound. */
  targetUrl?: string | null;
  methods: WebhookMethod[];
  /** Eventos emitidos, somente outbound. */
  events?: WebhookEventName[];
  /** F5.1: inbound que recebe dados de WhatsApp e alimenta o agente. */
  isWhatsappReceiver?: boolean;
  /** F5.1: número da empresa (obrigatório/único quando isWhatsappReceiver). */
  businessId?: string | null;
}

export interface WebhookListItem {
  id: string;
  direction: WebhookDirection;
  name: string | null;
  description: string | null;
  path: string | null;
  targetUrl: string | null;
  methods: string[];
  /** Eventos emitidos (outbound). Vazio em inbound. */
  events: WebhookEventName[];
  /** F5.1: recebe dados de WhatsApp (inbound). */
  isWhatsappReceiver: boolean;
  /** F5.1: número da empresa (receptor de WhatsApp). */
  businessId: string | null;
  /** Dica do token: pontilhado + últimos caracteres, para o usuário se localizar. */
  secretHint: string;
  enabled: boolean;
  createdAt: Date;
}

/** Mascara o secret (cifrado) para exibição: `••••` + últimos 5 caracteres. */
function maskSecret(encrypted: string): string {
  try {
    const plain = decrypt(encrypted);
    const tail = plain.slice(-5);
    return `••••${tail}`;
  } catch {
    return "••••";
  }
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

/**
 * Guarda das ações de webhook.
 *
 * Webhook comum: pode quem enxerga o menu Integrações (nível em `menu_access`).
 * Webhook do WhatsApp (o que alimenta o Agente Nex): SEMPRE só o super_admin,
 * independentemente do nível do menu. Decisão do usuário em 2026-07-09.
 *
 * A tela já esconde o que o perfil não pode; isto aqui recusa de novo, porque
 * esconder sem recusar não é proteção.
 */
async function guardaWebhook(
  ehWhatsapp: boolean,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  const acesso = await obterMenuAccess();
  if (!podeGerenciarWebhooks(me.platformRole, acesso.integracoes, ehWhatsapp)) {
    return { ok: false, error: "Acesso negado" };
  }
  return { ok: true, user: me };
}

/**
 * O webhook alvo pertence ao território do WhatsApp? (usado nas ações por id)
 * Vale para o receptor E para qualquer linha de uma Conexão com WhatsApp
 * (`connection_id` preenchido): a linha de ENVIO da conexão não é
 * `isWhatsappReceiver`, mas editá-la/apagá-la desmontaria a conexão.
 */
async function alvoEhWhatsapp(id: string): Promise<boolean> {
  const row = await prisma.whatsappWebhook.findUnique({
    where: { id },
    select: { isWhatsappReceiver: true, connectionId: true },
  });
  return row?.isWhatsappReceiver === true || row?.connectionId != null;
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

// ──────────────────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────────────────

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
const eventSchema = z.enum(["agent_reply"]);

/** Slug seguro para o path de um webhook de entrada. */
const pathSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-/]*$/, "Caminho inválido");

const createSchema = z
  .object({
    direction: z.enum(["inbound", "outbound"]),
    name: z.string().trim().min(1, "Nome obrigatório"),
    description: z.string().trim().max(500, "Descrição muito longa").nullable().optional(),
    path: z.string().nullable().optional(),
    targetUrl: z.string().nullable().optional(),
    methods: z.array(methodSchema).min(1, "Selecione ao menos um método"),
    events: z.array(eventSchema).optional(),
    isWhatsappReceiver: z.boolean().optional(),
    businessId: z.string().trim().nullable().optional(),
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
      // Receptor de WhatsApp exige o número da empresa (identificador único).
      if (val.isWhatsappReceiver && !(val.businessId ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["businessId"],
          message: "Informe o número da empresa para o webhook de WhatsApp",
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
 * Gate: menu Integrações; o tipo WhatsApp exige super_admin.
 */
export async function createWebhook(
  input: CreateWebhookInput,
): Promise<DataResult<CreatedWebhook>> {
  const querWhatsapp = input.direction === "inbound" && input.isWhatsappReceiver === true;
  const guarda = await guardaWebhook(querWhatsapp);
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const data = parsed.data;

  // Caminho (path) de webhook de entrada precisa ser único, duplicado quebraria
  // o roteamento das requisições recebidas.
  if (data.direction === "inbound" && data.path) {
    const taken = await prisma.whatsappWebhook.findFirst({
      where: { direction: "inbound", path: data.path },
      select: { id: true },
    });
    if (taken) {
      return { success: false, error: "Já existe um webhook de entrada com esse caminho." };
    }
  }

  // F5.1: número da empresa (business_id) é único entre os receptores de WhatsApp.
  const isWaReceiver = data.direction === "inbound" && data.isWhatsappReceiver === true;
  const businessId = isWaReceiver ? (data.businessId ?? "").trim() : null;
  if (isWaReceiver && businessId) {
    const taken = await prisma.whatsappWebhook.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (taken) {
      return {
        success: false,
        error: "Já existe um webhook de WhatsApp com esse número da empresa.",
      };
    }
  }

  const secretPlain = generateSecret();
  const secretEncrypted = encrypt(secretPlain);

  try {
    const created = await prisma.whatsappWebhook.create({
      data: {
        direction: data.direction,
        name: data.name,
        description: data.description?.trim() || null,
        path: data.direction === "inbound" ? (data.path ?? null) : null,
        targetUrl: data.direction === "outbound" ? (data.targetUrl ?? null) : null,
        url: data.direction === "outbound" ? (data.targetUrl ?? null) : null,
        methods: data.methods,
        // Outbound novo nasce emitindo agent.reply; inbound nunca emite (F5 D).
        events:
          data.direction === "outbound" ? (data.events ?? ["agent_reply"]) : [],
        isWhatsappReceiver: isWaReceiver,
        businessId,
        secret: secretEncrypted,
        enabled: true,
      },
    });

    await logAudit({
      userId: me.id,
      action: "webhook_created",
      targetType: "webhook",
      targetId: created.id,
      details: { name: created.name, direction: created.direction },
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
// updateWebhook
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Atualiza um webhook (nome, métodos e caminho/URL). A direção não muda.
 * Mantém a checagem de caminho único.
 *
 * Gate: menu Integrações. Exige super_admin se o webhook ALVO já é do WhatsApp
 * (para não deixarem editá-lo, nem rebaixá-lo a genérico) ou se a edição quer
 * transformá-lo num receptor de WhatsApp.
 */
export async function updateWebhook(
  id: string,
  input: UpdateWebhookInput,
): Promise<DataResult<void>> {
  const ehWhatsapp = (await alvoEhWhatsapp(id)) || input.isWhatsappReceiver === true;
  const guarda = await guardaWebhook(ehWhatsapp);
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const existing = await prisma.whatsappWebhook.findUnique({
    where: { id },
    select: { id: true, direction: true },
  });
  if (!existing) return { success: false, error: "Webhook não encontrado" };
  const direction = existing.direction as WebhookDirection;

  const nameOk = z.string().trim().min(1).safeParse(input.name);
  if (!nameOk.success) return { success: false, error: "Nome obrigatório" };
  const methodsOk = z.array(methodSchema).min(1).safeParse(input.methods);
  if (!methodsOk.success) {
    return { success: false, error: "Selecione ao menos um método" };
  }

  let path: string | null = null;
  let targetUrl: string | null = null;
  let isWaReceiver = false;
  let businessId: string | null = null;

  if (direction === "inbound") {
    const p = pathSchema.safeParse(input.path ?? "");
    if (!p.success) {
      return { success: false, error: "Caminho inválido para webhook de entrada" };
    }
    path = p.data;
    const taken = await prisma.whatsappWebhook.findFirst({
      where: { direction: "inbound", path, id: { not: id } },
      select: { id: true },
    });
    if (taken) {
      return { success: false, error: "Já existe um webhook de entrada com esse caminho." };
    }

    // F5.1: receptor de WhatsApp exige número da empresa, único (excluindo o próprio).
    isWaReceiver = input.isWhatsappReceiver === true;
    if (isWaReceiver) {
      businessId = (input.businessId ?? "").trim();
      if (!businessId) {
        return {
          success: false,
          error: "Informe o número da empresa para o webhook de WhatsApp",
        };
      }
      const dup = await prisma.whatsappWebhook.findFirst({
        where: { businessId, id: { not: id } },
        select: { id: true },
      });
      if (dup) {
        return {
          success: false,
          error: "Já existe um webhook de WhatsApp com esse número da empresa.",
        };
      }
    }
  } else {
    const u = z.string().url().safeParse(input.targetUrl ?? "");
    if (!u.success) {
      return { success: false, error: "URL de destino inválida" };
    }
    targetUrl = u.data;
  }

  // Eventos só se aplicam a outbound; inbound fica sempre vazio (F5 D).
  const events: WebhookEventName[] =
    direction === "outbound"
      ? (z.array(eventSchema).safeParse(input.events).success
          ? (input.events ?? ["agent_reply"])
          : ["agent_reply"])
      : [];

  const descriptionOk = z
    .string()
    .trim()
    .max(500, "Descrição muito longa")
    .nullable()
    .optional()
    .safeParse(input.description);
  if (!descriptionOk.success) {
    return { success: false, error: "Descrição muito longa" };
  }

  try {
    await prisma.whatsappWebhook.update({
      where: { id },
      data: {
        name: nameOk.data,
        description: (descriptionOk.data ?? "")?.toString().trim() || null,
        methods: methodsOk.data,
        path,
        targetUrl,
        url: direction === "outbound" ? targetUrl : null,
        events,
        isWhatsappReceiver: isWaReceiver,
        businessId,
      },
    });
    await logAudit({
      userId: me.id,
      action: "webhook_updated",
      targetType: "webhook",
      targetId: id,
      details: { name: nameOk.data, direction },
    });
    revalidatePath("/integracoes/webhooks");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[webhooks] updateWebhook error:", err);
    return { success: false, error: "Erro ao atualizar webhook" };
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
  const guarda = await guardaWebhook(false);
  if (!guarda.ok) return { success: false, error: guarda.error };

  // Quem não pode gerenciar o receptor de WhatsApp também não o vê na lista.
  // Mostrá-lo só para depois negar o clique seria a UI mentindo de novo.
  const escondeWhatsapp = !podeGerenciarWhatsappWebhook(guarda.user.platformRole);

  try {
    const rows = await prisma.whatsappWebhook.findMany({
      // Some o receptor e TODAS as linhas de Conexões com WhatsApp (a linha de
      // envio não é receptora, mas pertence à conexão do mesmo jeito).
      where: escondeWhatsapp ? { isWhatsappReceiver: false, connectionId: null } : undefined,
      orderBy: { createdAt: "desc" },
    });

    const data: WebhookListItem[] = rows.map((r) => ({
      id: r.id,
      direction: r.direction as WebhookDirection,
      name: r.name,
      description: r.description ?? null,
      path: r.path,
      targetUrl: r.targetUrl ?? r.url,
      methods: r.methods,
      events: (r.events as WebhookEventName[] | undefined) ?? [],
      isWhatsappReceiver: r.isWhatsappReceiver ?? false,
      businessId: r.businessId ?? null,
      secretHint: maskSecret(r.secret),
      enabled: r.enabled,
      createdAt: r.createdAt,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("[webhooks] listWebhooks error:", err);
    return { success: false, error: "Erro ao listar webhooks" };
  }
}

/** Retorna um webhook por id (sem o secret). Gate: super_admin. */
export async function getWebhook(id: string): Promise<DataResult<WebhookListItem>> {
  const guarda = await guardaWebhook(await alvoEhWhatsapp(id));
  if (!guarda.ok) return { success: false, error: guarda.error };

  try {
    const r = await prisma.whatsappWebhook.findUnique({ where: { id } });
    if (!r) return { success: false, error: "Webhook não encontrado" };
    return {
      success: true,
      data: {
        id: r.id,
        direction: r.direction as WebhookDirection,
        name: r.name,
        description: r.description ?? null,
        path: r.path,
        targetUrl: r.targetUrl ?? r.url,
        methods: r.methods,
        events: (r.events as WebhookEventName[] | undefined) ?? [],
        isWhatsappReceiver: r.isWhatsappReceiver ?? false,
        businessId: r.businessId ?? null,
        secretHint: maskSecret(r.secret),
        enabled: r.enabled,
        createdAt: r.createdAt,
      },
    };
  } catch (err) {
    console.error("[webhooks] getWebhook error:", err);
    return { success: false, error: "Erro ao buscar webhook" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// rotateWebhookSecret
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Gera um novo secret para o webhook e o retorna em claro uma única vez.
 * Gate: menu Integrações; se o webhook é do WhatsApp, exige super_admin.
 */
export async function rotateWebhookSecret(
  id: string,
): Promise<DataResult<RotatedWebhookSecret>> {
  const guarda = await guardaWebhook(await alvoEhWhatsapp(id));
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const secretPlain = generateSecret();
  const secretEncrypted = encrypt(secretPlain);

  try {
    await prisma.whatsappWebhook.update({
      where: { id },
      data: { secret: secretEncrypted },
    });

    await logAudit({
      userId: me.id,
      action: "webhook_secret_rotated",
      targetType: "webhook",
      targetId: id,
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
  const guarda = await guardaWebhook(await alvoEhWhatsapp(id));
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  try {
    await prisma.whatsappWebhook.update({
      where: { id },
      data: { enabled },
    });

    await logAudit({
      userId: me.id,
      action: "webhook_toggled",
      targetType: "webhook",
      targetId: id,
      details: { enabled },
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
  const guarda = await guardaWebhook(await alvoEhWhatsapp(id));
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  try {
    const existing = await prisma.whatsappWebhook.findUnique({
      where: { id },
      select: { name: true, direction: true },
    });
    await prisma.whatsappWebhook.delete({ where: { id } });

    await logAudit({
      userId: me.id,
      action: "webhook_deleted",
      targetType: "webhook",
      targetId: id,
      details: { name: existing?.name ?? null, direction: existing?.direction ?? null },
    });

    revalidatePath("/integracoes/webhooks");

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[webhooks] deleteWebhook error:", err);
    return { success: false, error: "Erro ao deletar webhook" };
  }
}
