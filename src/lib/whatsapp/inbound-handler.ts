/**
 * Núcleo do recebimento de mensagens WhatsApp (fluxo externo → plataforma).
 *
 * Usado exclusivamente pelo caminho por SLUG (`/api/webhooks/<slug>` e o
 * apelido `/api/hooks/<slug>`), via `slug-inbound.ts`. A antiga rota fixa
 * `/api/integrations/whatsapp/inbound` foi descontinuada e responde 410 Gone.
 *
 * Recebe o webhook receptor já resolvido (secret + business_id + conexão) e
 * executa: validação do token (Authorization: Bearer), validação do payload,
 * idempotência, resolução do usuário, barreiras L1/L2, teto diário e
 * enfileiramento do job. Todo disparo de saída é escopado ao `connectionId`
 * da conexão que recebeu a mensagem (SPEC §3.3, fail-closed).
 */

import { type NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/whatsapp/hmac";
import { decrypt } from "@/lib/encryption";
import { inboundSchema } from "@/lib/whatsapp/inbound-payload";
import { resolveWhatsappUser } from "@/lib/whatsapp/resolve";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AGENT_QUEUE_NAME } from "@/worker/agent/queue";
import type { AgentJobData } from "@/worker/agent/processor";
import { emitAgentReply, type OutboundTarget } from "@/lib/whatsapp/emit-reply";
import { blockedMessageFor, type BlockReason } from "@/lib/whatsapp/blocked-messages";
import { roleMeetsChannelLevel } from "@/lib/agent/channel-access";
import type { ChannelAccessLevel, WhatsappResponseMode } from "@/generated/prisma/client";

const RL_IP_MAX = 30;
const RL_FROM_MAX = 10;
const RL_WINDOW_SEC = 60;
const DEFAULT_DAILY_LIMIT = 100;

/** Webhook receptor já resolvido (o necessário para processar a entrada). */
export interface InboundWebhookContext {
  secret: string;
  businessId: string | null;
  /**
   * Conexão dona do webhook (isolamento por conexão, SPEC §3.3). Opcionais
   * porque linhas antigas podem não ter `connection_id`; nesses casos o
   * disparo de saída é fail-closed (nenhum destino).
   */
  connectionId?: string | null;
  connectionName?: string | null;
  responseMode?: WhatsappResponseMode | null;
}

let agentQueueInstance: Queue<AgentJobData> | null = null;
function getAgentQueue(): Queue<AgentJobData> {
  if (!agentQueueInstance) {
    const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    agentQueueInstance = new Queue<AgentJobData>(AGENT_QUEUE_NAME, { connection });
  }
  return agentQueueInstance;
}

/**
 * Targets de saída habilitados que emitem agent_reply (URL + secret descifrado),
 * SEMPRE escopados à conexão dona da mensagem (SPEC §3.3, fecha A1/A1b).
 *
 * Fail-closed: sem `connectionId` não há como saber de quem é o destino, então
 * ninguém recebe. Não existe fallback para webhooks legados sem conexão, porque
 * ele reintroduziria o vazamento entre clientes.
 */
async function loadOutboundTargets(connectionId?: string | null): Promise<OutboundTarget[]> {
  if (!connectionId) return [];
  const rows = await prisma.whatsappWebhook
    .findMany({
      where: { direction: "outbound", enabled: true, events: { has: "agent_reply" }, connectionId },
    })
    .catch(() => [] as Array<{ targetUrl: string | null; url: string | null; secret: string }>);
  return rows.flatMap((w) => {
    const url = w.targetUrl ?? w.url;
    if (!url) return [];
    try {
      return [{ url, secret: decrypt(w.secret) }];
    } catch {
      return [];
    }
  });
}

/** Dispara o webhook de saída `agent.reply` com `kind:"blocked"` (barreiras L1/L2). */
async function fireBlocked(
  reason: BlockReason,
  to: string,
  webhook: InboundWebhookContext,
  inboundMessageId: string,
): Promise<void> {
  // Escopado à conexão que recebeu a mensagem: o "não encontrei seu número"
  // expõe o telefone de quem escreveu e não pode ir para o destino de outro
  // cliente (SPEC A1b).
  const targets = await loadOutboundTargets(webhook.connectionId);
  const businessId = webhook.businessId;
  await emitAgentReply(targets, {
    kind: "blocked",
    data: {
      inboundMessageId,
      to,
      businessId: businessId,
      sessionId: null,
      assistantMessageId: null,
      ok: false,
      reason,
      reply: blockedMessageFor(reason),
      suggestions: [],
      tools: [],
      reasoningMs: 0,
      usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
      messageType: "text",
    },
  }).catch((e) => console.warn("[inbound] fireBlocked falhou:", e));
}

/**
 * Processa uma requisição de entrada para um webhook receptor já resolvido.
 * Valida o token, o payload, idempotência, barreiras e enfileira o job.
 */
export async function handleWhatsappInbound(
  req: NextRequest,
  webhook: InboundWebhookContext,
): Promise<NextResponse> {
  // Rate limit por IP.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const ipRl = await checkRateLimit(`whatsapp_inbound:ip:${ip}`, RL_IP_MAX, RL_WINDOW_SEC).catch(() => ({ allowed: true, remaining: 0 }));
  if (!ipRl.allowed) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  // Corpo cru.
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o corpo da requisição" }, { status: 400 });
  }
  if (bodyText.length > 256 * 1024) {
    return NextResponse.json({ error: "Payload muito grande" }, { status: 413 });
  }

  // Token fixo (fail-closed): Authorization: Bearer <token do webhook>.
  const authHeader = req.headers.get("authorization") ?? "";
  const providedToken = authHeader.slice(0, 7).toLowerCase() === "bearer "
    ? authHeader.slice(7).trim()
    : "";
  if (!verifyToken(providedToken, webhook.secret)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  // Parse + validação.
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = inboundSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // Rate limit por número.
  const fromRl = await checkRateLimit(`whatsapp_inbound:from:${payload.wa_id}`, RL_FROM_MAX, RL_WINDOW_SEC).catch(() => ({ allowed: true, remaining: 0 }));
  if (!fromRl.allowed) {
    return NextResponse.json({ error: "Rate limit excedido para este número" }, { status: 429 });
  }

  // Idempotência , dedup por message_id.
  const existing = await prisma.processedWhatsappMessage.findUnique({
    where: { messageId: payload.message_id },
  });
  if (existing) {
    return NextResponse.json({ noOp: true, messageId: payload.message_id }, { status: 200 });
  }

  // Resolução do usuário (pelo wa_id; user_id guardado p/ futuro).
  const resolved = await resolveWhatsappUser(payload.wa_id);
  if (resolved.status !== "ok") {
    const l1Reason: BlockReason =
      resolved.status === "inactive" ? "user_inactive" : "user_not_found";
    await logAudit({
      action: "whatsapp_inbound_rejected",
      details: { reason: resolved.status, from: payload.wa_id, messageId: payload.message_id },
    });
    await fireBlocked(l1Reason, payload.wa_id, webhook, payload.message_id);
    return NextResponse.json({ rejected: true, reason: resolved.status }, { status: 200 });
  }
  const { user } = resolved;

  // L2: canal WhatsApp habilitado para o nível do usuário?
  const agentSettings = await prisma.agentSettings
    .findFirst({ select: { whatsappAccessLevel: true } })
    .catch(() => null);
  const whatsappLevel: ChannelAccessLevel = agentSettings?.whatsappAccessLevel ?? "off";
  if (!roleMeetsChannelLevel(user.platformRole, whatsappLevel)) {
    const l2Reason: BlockReason =
      whatsappLevel === "off" ? "channel_disabled" : "role_not_allowed";
    await fireBlocked(l2Reason, payload.wa_id, webhook, payload.message_id);
    return NextResponse.json({ rejected: true, reason: l2Reason }, { status: 200 });
  }

  // Teto diário por usuário.
  const dailyLimitSetting = await prisma.appSetting
    .findUnique({ where: { key: "whatsapp_daily_limit" } })
    .catch(() => null);
  const dailyLimit =
    dailyLimitSetting && typeof dailyLimitSetting.value === "number"
      ? dailyLimitSetting.value
      : DEFAULT_DAILY_LIMIT;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const userDailyCount = await prisma.processedWhatsappMessage
    .count({ where: { userId: user.id, processedAt: { gte: todayStart } } })
    .catch(() => 0);
  if (userDailyCount >= dailyLimit) {
    return NextResponse.json({ rejected: true, reason: "daily_limit_exceeded" }, { status: 200 });
  }

  // Config de resposta do canal.
  const channel = await prisma.whatsappChannel
    .findUnique({ where: { id: "global" } })
    .catch(() => null);
  const responseMode = channel?.responseMode ?? "direct";
  let channelConfig: AgentJobData["channelConfig"];
  if (responseMode === "n8n_webhook") {
    // Escopado à conexão (SPEC §3.3). Trade-off declarado: os targets são
    // resolvidos AQUI, no enqueue, e viajam congelados no job; um retry usa o
    // destino do momento do enqueue, não o atual. A janela é de segundos e é
    // aceitável; mudar isso exigiria resolver os targets dentro do worker.
    channelConfig = {
      responseMode: "n8n_webhook",
      outboundTargets: await loadOutboundTargets(webhook.connectionId),
    };
  } else {
    channelConfig = { responseMode: "direct" };
  }

  // Enfileira (anexa o business_id do webhook para rotear a resposta).
  const jobData: AgentJobData = {
    messageId: payload.message_id,
    userId: user.id,
    channel: "whatsapp",
    type: payload.type,
    text: payload.text,
    media: payload.media,
    waUserId: payload.user_id,
    replyTo: payload.wa_id,
    businessId: webhook.businessId ?? undefined,
    contactName: payload.contact_name,
    channelConfig,
  };
  const job = await getAgentQueue().add("process-message", jobData, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  await prisma.processedWhatsappMessage.create({
    data: { messageId: payload.message_id, userId: user.id },
  });

  return NextResponse.json({ queued: true, jobId: job.id }, { status: 202 });
}
