"use server";

/**
 * Server Actions da Conexão com WhatsApp (SPEC 2026-07-09 §3.6).
 *
 * Uma Conexão = DUAS linhas em `whatsapp_webhooks` (recebimento + envio)
 * ligadas pelo mesmo `connection_id`, operadas como UMA coisa: criar grava as
 * duas numa transação, apagar remove as duas, rotacionar troca o token de UMA
 * ponta, listar agrupa por `connection_id`.
 *
 * Gate: TODAS as operações são exclusivas do super_admin (PR #160).
 * Tokens cifrados com AES-256-GCM; valor em claro retornado uma única vez.
 */

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-helpers";
import { encrypt, decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { verificarNumeroParaConexao } from "@/lib/whatsapp/numero-unico";
import { verificarNomeDeWebhook } from "@/lib/integrations/nome-unico";
import type { WhatsappResponseMode } from "@/generated/prisma/client";
import type { WebhookListItem } from "@/lib/actions/webhooks";

type DataResult<T> = { success: true; data: T } | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tokens da conexão, gerados no servidor ANTES da criação (sem persistir).
 * Cada um é exibido na SUA etapa do assistente, em bloco reservado
 * (mascarado, com aviso), e só passa a valer quando a conexão é criada.
 */
export interface TokensDaConexao {
  /** Token que o fluxo externo usa para ENTRAR (Authorization: Bearer). */
  tokenRecebimento: string;
  /** Token com que assinamos o payload de SAÍDA (X-Signature). */
  tokenAssinatura: string;
}

export interface CriarConexaoInput {
  name: string;
  description?: string | null;
  /** Endereço (slug) do recebimento. */
  path: string;
  /** Número da empresa (WhatsApp Business) que esta conexão atende. */
  businessId: string;
  /** URL de destino do envio. */
  targetUrl: string;
  /** Tokens exibidos nas etapas 1 e 2 (`prepararTokensConexao`). */
  tokenRecebimento: string;
  tokenAssinatura: string;
}

export interface ConexaoCriada {
  connectionId: string;
  inboundId: string;
  outboundId: string;
}

export interface ConexaoWhatsappListItem {
  connectionId: string;
  name: string | null;
  description: string | null;
  businessId: string | null;
  /** Endereço (slug) do recebimento. */
  path: string | null;
  /** Destino do envio; null quando a conexão ainda não tem a ponta de envio. */
  targetUrl: string | null;
  responseMode: WhatsappResponseMode | null;
  enabled: boolean;
  inboundId: string | null;
  outboundId: string | null;
  secretHintRecebimento: string | null;
  secretHintAssinatura: string | null;
  createdAt: Date;
}

export interface ListConnectionsData {
  conexoes: ConexaoWhatsappListItem[];
  /** Webhooks sem conexão (genéricos e legados), no formato da listagem atual. */
  avulsos: WebhookListItem[];
}

export type PontaDaConexao = "recebimento" | "assinatura";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Gate único: Conexão com WhatsApp é território exclusivo do super_admin. */
async function guardaSuperAdmin(): Promise<
  { ok: true; user: AuthUser } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "super_admin") return { ok: false, error: "Acesso negado" };
  return { ok: true, user: me };
}

function gerarToken(): string {
  return randomBytes(32).toString("hex");
}

function maskSecret(encrypted: string): string {
  try {
    const plain = decrypt(encrypted);
    return `••••${plain.slice(-5)}`;
  } catch {
    return "••••";
  }
}

const pathSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-/]*$/, "Endereço inválido: use letras minúsculas, números e hífens");

const criarSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  description: z.string().trim().max(500, "Descrição muito longa").nullable().optional(),
  path: pathSchema,
  businessId: z.string().trim().min(8, "Informe o número da empresa com DDI e DDD"),
  targetUrl: z.string().trim().url("URL de destino inválida"),
  tokenRecebimento: z.string().min(32, "Token de recebimento inválido"),
  tokenAssinatura: z.string().min(32, "Token de assinatura inválido"),
});

// ──────────────────────────────────────────────────────────────────────────────
// prepararTokensConexao
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Gera os dois tokens SEM efeito colateral (nada é persistido). O assistente
 * exibe cada um na sua etapa, em bloco reservado; eles só passam a valer
 * quando a conexão é criada. Recarregar a página gera tokens novos.
 */
export async function prepararTokensConexao(): Promise<DataResult<TokensDaConexao>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };

  return {
    success: true,
    data: { tokenRecebimento: gerarToken(), tokenAssinatura: gerarToken() },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// criarConexaoWhatsapp (TF.1)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cria a Conexão: DUAS linhas com o mesmo `connection_id`, numa transação.
 *
 * - Recebimento (inbound): slug, número da empresa, token de recebimento e
 *   `responseMode = "n8n_webhook"` , sem gravar o modo, a conexão nasceria em
 *   `direct` (o default global) e o destino seria ignorado em silêncio (A13).
 * - Envio (outbound): `url` E `targetUrl` (o disparo lê `targetUrl ?? url`),
 *   `events: ["agent_reply"]`, token de assinatura e `businessId` NULO (A9:
 *   único na tabela inteira).
 */
export async function criarConexaoWhatsapp(
  input: CriarConexaoInput,
): Promise<DataResult<ConexaoCriada>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const parsed = criarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const data = parsed.data;

  // Nome único entre TODOS os webhooks (qualquer tipo).
  const nomeEmUso = await verificarNomeDeWebhook(data.name);
  if (nomeEmUso) return { success: false, error: nomeEmUso };

  // Slug único entre os webhooks de entrada.
  const slugOcupado = await prisma.whatsappWebhook.findFirst({
    where: { direction: "inbound", path: data.path },
    select: { id: true },
  });
  if (slugOcupado) {
    return { success: false, error: "Já existe um webhook de entrada com esse caminho." };
  }

  // Trava de número único (SPEC §3.4.1): recusa número do canal direto ou de
  // outra conexão, com mensagem nomeando o que já existe.
  const trava = await verificarNumeroParaConexao(data.businessId);
  if (!trava.ok) return { success: false, error: trava.error };

  const connectionId = randomUUID();

  try {
    const criadas = await prisma.$transaction(async (tx) => {
      const inbound = await tx.whatsappWebhook.create({
        data: {
          direction: "inbound",
          name: data.name,
          description: data.description?.trim() || null,
          path: data.path,
          targetUrl: null,
          url: null,
          methods: ["POST"],
          events: [],
          isWhatsappReceiver: true,
          businessId: data.businessId,
          connectionId,
          // A13: o assistente conclui a etapa de Envio, então o modo da
          // conexão nasce apontando para o webhook de saída.
          responseMode: "n8n_webhook",
          secret: encrypt(data.tokenRecebimento),
          enabled: true,
        },
      });
      const outbound = await tx.whatsappWebhook.create({
        data: {
          direction: "outbound",
          name: data.name,
          description: data.description?.trim() || null,
          path: null,
          targetUrl: data.targetUrl,
          url: data.targetUrl,
          methods: ["POST"],
          events: ["agent_reply"],
          isWhatsappReceiver: false,
          businessId: null,
          connectionId,
          responseMode: null,
          secret: encrypt(data.tokenAssinatura),
          enabled: true,
        },
      });
      return { inbound, outbound };
    });

    await logAudit({
      userId: me.id,
      action: "whatsapp_connection_created",
      targetType: "whatsapp_connection",
      targetId: connectionId,
      details: { name: data.name, path: data.path },
    });

    revalidatePath("/integracoes/webhooks");

    return {
      success: true,
      data: {
        connectionId,
        inboundId: criadas.inbound.id,
        outboundId: criadas.outbound.id,
      },
    };
  } catch (err) {
    console.error("[whatsapp-connection] criarConexaoWhatsapp:", err);
    return { success: false, error: "Erro ao criar a conexão" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// atualizarConexaoWhatsapp (TG.7a/TG.7b)
// ──────────────────────────────────────────────────────────────────────────────

export interface AtualizarConexaoInput {
  name: string;
  description?: string | null;
  path: string;
  businessId: string;
  /** Destino do envio. Vazio/ausente = não mexe na ponta de envio. */
  targetUrl?: string | null;
}

const atualizarSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  description: z.string().trim().max(500, "Descrição muito longa").nullable().optional(),
  path: pathSchema,
  businessId: z.string().trim().min(8, "Informe o número da empresa com DDI e DDD"),
  targetUrl: z
    .string()
    .trim()
    .url("URL de destino inválida")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

/**
 * Edita a Conexão como UMA coisa: nome e descrição vão para as DUAS linhas;
 * recebimento (slug + número) edita a linha inbound; envio (destino) edita a
 * linha outbound.
 *
 * **A13 no cliente real (TG.7b):** o backfill deixou `response_mode` NULL.
 * Sempre que um destino é configurado por aqui, a linha de recebimento grava
 * `responseMode = "n8n_webhook"` , sem isso o modo efetivo continuaria
 * `direct` e o destino seria ignorado em silêncio. Se a conexão ainda não tem
 * a ponta de envio, ela é criada com um token de assinatura novo, retornado
 * uma única vez em `novoTokenAssinatura`.
 */
export async function atualizarConexaoWhatsapp(
  connectionId: string,
  input: AtualizarConexaoInput,
): Promise<DataResult<{ novoTokenAssinatura: string | null }>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const parsed = atualizarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const data = parsed.data;

  const linhas = await prisma.whatsappWebhook.findMany({
    where: { connectionId },
    select: { id: true, direction: true, responseMode: true },
  });
  const inbound = linhas.find((l) => l.direction === "inbound");
  if (!inbound) {
    return { success: false, error: "Conexão não encontrada" };
  }
  const outbound = linhas.find((l) => l.direction === "outbound") ?? null;

  // Nome único, ignorando as DUAS linhas desta conexão (compartilham o nome).
  const nomeEmUso = await verificarNomeDeWebhook(data.name, {
    ignorarConnectionId: connectionId,
  });
  if (nomeEmUso) return { success: false, error: nomeEmUso };

  // Slug único entre os webhooks de entrada (excluindo a própria linha).
  const slugOcupado = await prisma.whatsappWebhook.findFirst({
    where: { direction: "inbound", path: data.path, id: { not: inbound.id } },
    select: { id: true },
  });
  if (slugOcupado) {
    return { success: false, error: "Já existe um webhook de entrada com esse caminho." };
  }

  // Trava de número único, ignorando a própria conexão (SPEC §3.4.1).
  const trava = await verificarNumeroParaConexao(data.businessId, {
    ignorarConnectionId: connectionId,
  });
  if (!trava.ok) return { success: false, error: trava.error };

  const configurandoDestino = typeof data.targetUrl === "string" && data.targetUrl.length > 0;
  let novoTokenAssinatura: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      // Nome e descrição são DA conexão: vão para as duas linhas.
      await tx.whatsappWebhook.updateMany({
        where: { connectionId },
        data: { name: data.name, description: data.description?.trim() || null },
      });

      // Recebimento: slug + número (+ modo, quando o destino está configurado).
      await tx.whatsappWebhook.update({
        where: { id: inbound.id },
        data: {
          path: data.path,
          businessId: data.businessId,
          ...(configurandoDestino ? { responseMode: "n8n_webhook" as const } : {}),
        },
      });

      if (configurandoDestino) {
        if (outbound) {
          await tx.whatsappWebhook.update({
            where: { id: outbound.id },
            data: { targetUrl: data.targetUrl, url: data.targetUrl },
          });
        } else {
          // Conexão do backfill (sem ponta de envio): cria a linha outbound
          // com um token de assinatura novo, exibido uma única vez.
          novoTokenAssinatura = gerarToken();
          await tx.whatsappWebhook.create({
            data: {
              direction: "outbound",
              name: data.name,
              description: data.description?.trim() || null,
              path: null,
              targetUrl: data.targetUrl,
              url: data.targetUrl,
              methods: ["POST"],
              events: ["agent_reply"],
              isWhatsappReceiver: false,
              businessId: null,
              connectionId,
              responseMode: null,
              secret: encrypt(novoTokenAssinatura),
              enabled: true,
            },
          });
        }
      }
    });

    await logAudit({
      userId: me.id,
      action: "whatsapp_connection_updated",
      targetType: "whatsapp_connection",
      targetId: connectionId,
      details: { name: data.name, destinoConfigurado: configurandoDestino },
    });

    revalidatePath("/integracoes/webhooks");
    return { success: true, data: { novoTokenAssinatura } };
  } catch (err) {
    console.error("[whatsapp-connection] atualizarConexaoWhatsapp:", err);
    return { success: false, error: "Erro ao atualizar a conexão" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// alternarConexaoWhatsapp
// ──────────────────────────────────────────────────────────────────────────────

/** Liga/desliga a Conexão inteira (as duas linhas juntas). */
export async function alternarConexaoWhatsapp(
  connectionId: string,
  enabled: boolean,
): Promise<DataResult<void>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  try {
    const r = await prisma.whatsappWebhook.updateMany({
      where: { connectionId },
      data: { enabled },
    });
    if (r.count === 0) {
      return { success: false, error: "Conexão não encontrada" };
    }

    await logAudit({
      userId: me.id,
      action: "whatsapp_connection_updated",
      targetType: "whatsapp_connection",
      targetId: connectionId,
      details: { enabled },
    });

    revalidatePath("/integracoes/webhooks");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[whatsapp-connection] alternarConexaoWhatsapp:", err);
    return { success: false, error: "Erro ao atualizar a conexão" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// apagarConexaoWhatsapp (TF.2)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apaga a Conexão inteira (as duas linhas), numa transação.
 */
export async function apagarConexaoWhatsapp(
  connectionId: string,
): Promise<DataResult<void>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const linhas = await prisma.whatsappWebhook.findMany({
    where: { connectionId },
    select: { id: true, direction: true, name: true },
  });
  if (linhas.length === 0) {
    return { success: false, error: "Conexão não encontrada" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.whatsappWebhook.deleteMany({ where: { connectionId } });
    });

    await logAudit({
      userId: me.id,
      action: "whatsapp_connection_deleted",
      targetType: "whatsapp_connection",
      targetId: connectionId,
      details: { name: linhas[0]?.name ?? null, linhas: linhas.length },
    });

    revalidatePath("/integracoes/webhooks");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[whatsapp-connection] apagarConexaoWhatsapp:", err);
    return { success: false, error: "Erro ao apagar a conexão" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// rotacionarTokenConexao (TF.3)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Rotaciona o token de UMA ponta da conexão (`recebimento` = linha inbound;
 * `assinatura` = linha outbound) e devolve o novo valor uma única vez.
 * As pontas são independentes: rotacionar uma não toca a outra.
 */
export async function rotacionarTokenConexao(
  connectionId: string,
  ponta: PontaDaConexao,
): Promise<DataResult<{ secretPlain: string }>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };
  const me = guarda.user;

  const direction = ponta === "recebimento" ? "inbound" : "outbound";
  const linha = await prisma.whatsappWebhook.findFirst({
    where: { connectionId, direction },
    select: { id: true },
  });
  if (!linha) {
    return {
      success: false,
      error:
        ponta === "recebimento"
          ? "Esta conexão não tem a ponta de recebimento."
          : "Esta conexão ainda não tem a ponta de envio configurada.",
    };
  }

  const secretPlain = gerarToken();

  try {
    await prisma.whatsappWebhook.update({
      where: { id: linha.id },
      data: { secret: encrypt(secretPlain) },
    });

    await logAudit({
      userId: me.id,
      action: "whatsapp_connection_token_rotated",
      targetType: "whatsapp_connection",
      targetId: connectionId,
      details: { ponta },
    });

    revalidatePath("/integracoes/webhooks");
    return { success: true, data: { secretPlain } };
  } catch (err) {
    console.error("[whatsapp-connection] rotacionarTokenConexao:", err);
    return { success: false, error: "Erro ao rotacionar o token" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// listConnections (TF.4)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Visão agrupada: uma entrada por `connection_id` (as duas linhas juntas) e os
 * webhooks sem conexão como "avulsos" (genéricos e legados). `listWebhooks`
 * continua existindo para os consumidores atuais; esta é a visão da tela nova.
 */
export async function listConnections(): Promise<DataResult<ListConnectionsData>> {
  const guarda = await guardaSuperAdmin();
  if (!guarda.ok) return { success: false, error: guarda.error };

  try {
    const rows = await prisma.whatsappWebhook.findMany({
      orderBy: { createdAt: "desc" },
    });

    const porConexao = new Map<string, typeof rows>();
    const avulsos: WebhookListItem[] = [];

    for (const r of rows) {
      if (r.connectionId) {
        const grupo = porConexao.get(r.connectionId) ?? [];
        grupo.push(r);
        porConexao.set(r.connectionId, grupo);
      } else {
        avulsos.push({
          id: r.id,
          direction: r.direction as WebhookListItem["direction"],
          name: r.name,
          description: r.description ?? null,
          path: r.path,
          targetUrl: r.targetUrl ?? r.url,
          methods: r.methods,
          events: (r.events as WebhookListItem["events"] | undefined) ?? [],
          isWhatsappReceiver: r.isWhatsappReceiver ?? false,
          businessId: r.businessId ?? null,
          secretHint: maskSecret(r.secret),
          enabled: r.enabled,
          createdAt: r.createdAt,
        });
      }
    }

    const conexoes: ConexaoWhatsappListItem[] = [...porConexao.entries()].map(
      ([connectionId, grupo]) => {
        const inbound = grupo.find((g) => g.direction === "inbound") ?? null;
        const outbound = grupo.find((g) => g.direction === "outbound") ?? null;
        const principal = inbound ?? outbound!;
        return {
          connectionId,
          name: principal.name,
          description: principal.description ?? null,
          businessId: inbound?.businessId ?? null,
          path: inbound?.path ?? null,
          targetUrl: outbound ? (outbound.targetUrl ?? outbound.url) : null,
          responseMode: inbound?.responseMode ?? null,
          enabled: principal.enabled,
          inboundId: inbound?.id ?? null,
          outboundId: outbound?.id ?? null,
          secretHintRecebimento: inbound ? maskSecret(inbound.secret) : null,
          secretHintAssinatura: outbound ? maskSecret(outbound.secret) : null,
          createdAt: principal.createdAt,
        };
      },
    );

    return { success: true, data: { conexoes, avulsos } };
  } catch (err) {
    console.error("[whatsapp-connection] listConnections:", err);
    return { success: false, error: "Erro ao listar conexões" };
  }
}
