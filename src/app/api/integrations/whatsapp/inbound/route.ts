/**
 * POST /api/integrations/whatsapp/inbound
 *
 * Endpoint receptor de mensagens WhatsApp (n8n → plataforma).
 *
 * Fluxo (SPEC §6.1):
 *   1. Carrega o webhook inbound configurado e valida HMAC (X-Signature/X-Timestamp)
 *   2. Valida o payload Zod (inboundSchema)
 *   3. Idempotência: verifica se messageId já foi processado
 *   4. Resolve número → usuário da plataforma (resolveWhatsappUser)
 *   5. Aplica teto diário por usuário (AppSetting whatsapp_daily_limit, default 100)
 *   6. Grava ProcessedWhatsappMessage + enfileira job na fila `agent`
 *   7. Responde 202
 *
 * Respostas:
 *   401 , HMAC inválido
 *   400 , payload malformado ou JSON inválido
 *   200 + {noOp:true} , messageId já processado
 *   200 + {rejected:true, reason} , número desconhecido/inativo ou teto atingido
 *   202 + {queued:true, jobId} , job enfileirado
 */

import { type NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { verifySignature } from "@/lib/whatsapp/hmac";
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
import type { ChannelAccessLevel } from "@/generated/prisma/client";

/** Rate limit: 30 requisições por minuto por IP; 10 por minuto por número de origem. */
const RL_IP_MAX = 30;
const RL_FROM_MAX = 10;
const RL_WINDOW_SEC = 60;

/** Teto diário padrão de mensagens por usuário (sobrescrito por AppSetting). */
const DEFAULT_DAILY_LIMIT = 100;

/** Instância da fila , lazy, criada na primeira requisição. */
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
 * Carrega os targets de saída habilitados (URL + secret descifrado).
 *
 * Onda D: só os outbound habilitados que emitem `agent_reply` (filtro
 * `events: { has: "agent_reply" }`). O `targetUrl ?? url` prioriza a coluna
 * canônica (R6) e cai no `url` legado por robustez para linhas antigas.
 */
async function loadOutboundTargets(): Promise<OutboundTarget[]> {
  const rows = await prisma.whatsappWebhook
    .findMany({
      where: { direction: "outbound", enabled: true, events: { has: "agent_reply" } },
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

/**
 * Dispara o webhook de saída `agent.reply` com `kind:"blocked"` para uma
 * barreira do inbound (L1/L2). Falha de emissão é tolerada (log + segue).
 */
async function fireBlocked(
  reason: BlockReason,
  to: string,
  phoneNumberId: string | undefined,
  inboundMessageId: string,
): Promise<void> {
  const targets = await loadOutboundTargets();
  await emitAgentReply(targets, {
    kind: "blocked",
    data: {
      inboundMessageId,
      to,
      phoneNumberId: phoneNumberId ?? null,
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limit por IP ─────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const ipRl = await checkRateLimit(`whatsapp_inbound:ip:${ip}`, RL_IP_MAX, RL_WINDOW_SEC).catch(() => ({ allowed: true, remaining: 0 }));
  if (!ipRl.allowed) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  // ── Leitura do corpo cru (necessário antes do parse JSON) ──────────────────
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o corpo da requisição" }, { status: 400 });
  }

  // ── Limite de tamanho do corpo (ALTO-3 do review 4-6) ─────────────────────
  if (bodyText.length > 256 * 1024) {
    return NextResponse.json({ error: "Payload muito grande" }, { status: 413 });
  }

  // ── Autenticação HMAC (fail-closed) ──────────────────────────────────────
  // Sem webhook inbound habilitado → rejeita. Nunca aceitar tráfego sem secret.
  const inboundWebhook = await prisma.whatsappWebhook.findFirst({
    where: { direction: "inbound", enabled: true },
  }).catch(() => null);

  if (!inboundWebhook) {
    return NextResponse.json(
      { error: "Canal WhatsApp não configurado" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("x-signature") ?? "";
  const timestamp = req.headers.get("x-timestamp") ?? "";

  let secret: string;
  try {
    secret = decrypt(inboundWebhook.secret);
  } catch {
    return NextResponse.json({ error: "Configuração de segurança inválida" }, { status: 500 });
  }

  if (!verifySignature(bodyText, secret, signature, timestamp)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  // ── Parse e validação do payload ──────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = inboundSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  // ── Rate limit por número de origem ──────────────────────────────────────
  const fromRl = await checkRateLimit(`whatsapp_inbound:from:${payload.wa_id}`, RL_FROM_MAX, RL_WINDOW_SEC).catch(() => ({ allowed: true, remaining: 0 }));
  if (!fromRl.allowed) {
    return NextResponse.json({ error: "Rate limit excedido para este número" }, { status: 429 });
  }

  // ── Idempotência , dedup por message_id ───────────────────────────────────
  const existing = await prisma.processedWhatsappMessage.findUnique({
    where: { messageId: payload.message_id },
  });
  if (existing) {
    return NextResponse.json({ noOp: true, messageId: payload.message_id }, { status: 200 });
  }

  // ── Resolução de usuário (pelo wa_id; user_id guardado p/ futuro) ──────────
  const resolved = await resolveWhatsappUser(payload.wa_id);

  // ── L1: número existe e está ativo? (mensagem padrão via webhook) ──────────
  if (resolved.status !== "ok") {
    const l1Reason: BlockReason =
      resolved.status === "inactive" ? "user_inactive" : "user_not_found";
    await logAudit({
      action: "whatsapp_inbound_rejected",
      details: {
        reason: resolved.status,
        from: payload.wa_id,
        messageId: payload.message_id,
      },
    });
    await fireBlocked(l1Reason, payload.wa_id, undefined, payload.message_id);
    return NextResponse.json(
      { rejected: true, reason: resolved.status },
      { status: 200 },
    );
  }

  const { user } = resolved;

  // ── L2: canal WhatsApp habilitado para o nível do usuário? ─────────────────
  // `whatsappAccessLevel` é o nível mínimo de role (com herança). `off` bloqueia
  // todos; role abaixo do nível também. Bloqueio devolve mensagem padrão e não
  // enfileira (sem custo de IA). Hoje `whatsappEnabled` era cosmético; aqui o
  // gate passa a ser efetivo.
  const agentSettings = await prisma.agentSettings
    .findFirst({ select: { whatsappAccessLevel: true } })
    .catch(() => null);
  const whatsappLevel: ChannelAccessLevel = agentSettings?.whatsappAccessLevel ?? "off";

  if (!roleMeetsChannelLevel(user.platformRole, whatsappLevel)) {
    const l2Reason: BlockReason =
      whatsappLevel === "off" ? "channel_disabled" : "role_not_allowed";
    await fireBlocked(l2Reason, payload.wa_id, undefined, payload.message_id);
    return NextResponse.json(
      { rejected: true, reason: l2Reason },
      { status: 200 },
    );
  }

  // ── Teto diário por usuário ────────────────────────────────────────────────
  const dailyLimitSetting = await prisma.appSetting.findUnique({
    where: { key: "whatsapp_daily_limit" },
  }).catch(() => null);

  const dailyLimit =
    dailyLimitSetting && typeof dailyLimitSetting.value === "number"
      ? dailyLimitSetting.value
      : DEFAULT_DAILY_LIMIT;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Conta mensagens processadas hoje para este usuário via ProcessedWhatsappMessage.userId
  const userDailyCount = await prisma.processedWhatsappMessage
    .count({
      where: {
        userId: user.id,
        processedAt: { gte: todayStart },
      },
    })
    .catch(() => 0);

  if (userDailyCount >= dailyLimit) {
    return NextResponse.json(
      { rejected: true, reason: "daily_limit_exceeded" },
      { status: 200 },
    );
  }

  // ── Registrar idempotência (com userId) ───────────────────────────────────
  // Enfileira primeiro para evitar perda de mensagem se o create falhar.
  // O userId é gravado para permitir contagem correta do teto diário.

  // ── Carregar config do canal para o job ───────────────────────────────────
  const channel = await prisma.whatsappChannel.findUnique({
    where: { id: "global" },
  }).catch(() => null);

  const responseMode = channel?.responseMode ?? "direct";

  let channelConfig: AgentJobData["channelConfig"];
  if (responseMode === "n8n_webhook") {
    // Todos os outbound habilitados (helper único; targetUrl ?? url + secret).
    const outboundTargets = await loadOutboundTargets();
    channelConfig = {
      responseMode: "n8n_webhook",
      outboundTargets,
    };
  } else {
    channelConfig = { responseMode: "direct" };
  }

  // ── Enfileirar job na fila `agent` ────────────────────────────────────────
  const jobData: AgentJobData = {
    messageId: payload.message_id,
    userId: user.id,
    channel: "whatsapp",
    type: payload.type,
    text: payload.text,
    media: payload.media,
    waUserId: payload.user_id,
    replyTo: payload.wa_id,
    contactName: payload.contact_name,
    channelConfig,
  };

  const queue = getAgentQueue();
  const job = await queue.add("process-message", jobData, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  // ── Registrar idempotência APÓS enfileirar ────────────────────────────────
  // Ordem: enfileira primeiro → grava idempotência depois.
  // Se o create falhar, o job pode ser processado 2× (dedup por messageId no job),
  // que é preferível a perder a mensagem silenciosamente (M4 do review 4-6).
  await prisma.processedWhatsappMessage.create({
    data: { messageId: payload.message_id, userId: user.id },
  });

  return NextResponse.json({ queued: true, jobId: job.id }, { status: 202 });
}
