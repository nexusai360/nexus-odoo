/**
 * Processor do job BullMQ `agent`.
 *
 * Recebe um job com dados da mensagem WhatsApp (texto ou áudio),
 * chama o núcleo do agente e despacha a resposta no modo configurado:
 *
 * - `direct`:      envia via Graph API (cloud-client.sendText)
 * - `n8n_webhook`: POST assinado HMAC no outboundUrl configurado
 *
 * Para mensagens de áudio (P6):
 *   1. Baixa o binário via cloud-client.downloadMedia(audioMediaId)
 *   2. Transcreve via transcribeAudio()
 *   3. Usa o texto transcrito como entrada do agente
 */

import { runAgent } from "@/lib/agent/run-agent";
import { redis } from "@/lib/redis";
import { getOrCreateWhatsappConversation } from "@/lib/agent/conversation";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { buildCloudClientFromDb } from "@/lib/whatsapp/cloud-client";
import { emitAgentReply, type AgentReplyData, type OutboundTarget } from "@/lib/whatsapp/emit-reply";
import { buildReplyData } from "./build-reply-data";
import { prisma } from "@/lib/prisma";
import { acquireUserLock, releaseUserLock } from "./user-lock";
import { isMediaType, type InboundMedia, type InboundMessageType } from "@/lib/whatsapp/inbound-payload";
import type { AgentChannel } from "@/generated/prisma/client";

export interface AgentJobChannelConfig {
  responseMode: "direct" | "n8n_webhook";
  /** Targets de saída (URL + secret descifrado), presente em n8n_webhook. */
  outboundTargets?: OutboundTarget[];
}

export interface AgentJobData {
  /** ID da mensagem WhatsApp , chave de dedup (já registrada no inbound). */
  messageId: string;
  /** ID do usuário da plataforma (resolvido pelo inbound). */
  userId: string;
  /** Canal do agente , sempre "whatsapp" para jobs desta fila. */
  channel: AgentChannel;
  /** Tipo da mensagem (F5.1: ampliado para mídia). */
  type: InboundMessageType;
  /** Texto da mensagem (text/audio; legenda em mídia). */
  text?: string;
  /** Mídia (F5.1): presente quando type é image/document/video/sticker. */
  media?: InboundMedia;
  /** ID do usuário Meta (F5.1, user_id), guardado para o futuro. */
  waUserId?: string;
  /** Media ID legado para download do áudio via Meta direta (não usado no n8n). */
  audioMediaId?: string;
  /** Media ID legado para download da imagem via Meta direta (não usado no n8n). */
  imageMediaId?: string;
  /** Número de destino para a resposta (E.164). */
  replyTo: string;
  /** Número da empresa (business_id) do webhook receptor, para rotear a resposta. */
  businessId?: string;
  /** ID do número Meta para rotear a resposta (legado/opcional). */
  phoneNumberId?: string;
  /** Nome de exibição do contato, para monitoramento (opcional). */
  contactName?: string;
  /** Configuração de resposta do canal. */
  channelConfig: AgentJobChannelConfig;
}

/**
 * Processa um job da fila `agent`.
 * Exportado como função para facilitar testes sem BullMQ.
 */
export async function processAgentJob(data: AgentJobData): Promise<void> {
  // 0. Idempotência de saída (§9): se já respondemos esta mensagem, reentrega o
  //    payload salvo SEM rodar o agente nem adquirir lock. Cobre o retry do
  //    BullMQ quando só o POST de saída falhou.
  const replayKey = `whatsapp:replied:${data.messageId}`;
  const cached = await redis.get(replayKey).catch(() => null);
  if (cached) {
    try {
      const replyData = JSON.parse(cached) as AgentReplyData;
      await dispatchReply(data, replyData);
    } catch (e) {
      console.warn("[agent-processor] replay falhou:", e);
    }
    return;
  }

  // G2 , Regras de comportamento para WhatsApp baseadas nos checkpoints
  // configurados em AgentSettings. "PRODUCTION" libera o recurso para o
  // WhatsApp; outros valores indicam que o canal não deve processar mídia.
  const settings = await prisma.agentSettings.findFirst().catch(() => null);
  const audioInProduction = settings?.audioCheckpoint === "PRODUCTION";

  // F5.1 , Mídia (image/document/video/sticker): a leitura do arquivo pela IA
  // (ler PDF/imagem e entender o contexto) é etapa futura. Por ora aceitamos os
  // campos no contrato, mas respondemos um aviso amigável e não acionamos o
  // agente. Quando a leitura de mídia entrar, este bloco vira o pipeline de visão.
  if (isMediaType(data.type)) {
    const mediaNotice =
      "Recebi seu arquivo, mas ainda não consigo lê-lo por aqui. " +
      "Por enquanto, me envie sua pergunta por escrito que eu te ajudo.";
    await dispatchNotice(data, mediaNotice);
    return;
  }

  // n8n entrega o áudio JÁ transcrito em data.text => não depende do
  // audioCheckpoint. Só barra quando NÃO há texto (mídia Meta crua + canal off).
  if (data.type === "audio" && !audioInProduction && !data.text) {
    // G2 , Áudio (mídia Meta) desativado para WhatsApp: responder explicando.
    const message =
      "No momento não consigo entender mensagens de áudio. Por favor, envie sua pergunta por escrito.";
    await dispatchNotice(data, message);
    return;
  }

  // 1. Resolver texto da mensagem (text, áudio transcrito via n8n, ou áudio Meta)
  let userMessage: string;
  const isAudio = data.type === "audio";

  if (isAudio && data.text && data.text.trim().length > 0) {
    // Caminho n8n: o áudio já vem transcrito em data.text. Não baixa nem transcreve.
    userMessage = data.text;
  } else if (isAudio) {
    // Caminho Meta direto: baixa o áudio e transcreve.
    if (!data.audioMediaId) {
      throw new Error("[agent-processor] audioMediaId ausente para tipo=audio");
    }

    // Download de mídia requer credenciais Meta independente do modo de resposta.
    // Se não estiverem disponíveis, responde com pedido amigável em vez de matar o job.
    let cloudClient: Awaited<ReturnType<typeof buildCloudClientFromDb>> | null = null;
    try {
      cloudClient = await buildCloudClientFromDb();
    } catch (err) {
      console.warn("[agent-processor] Cloud client indisponível para áudio:", err);
    }

    if (!cloudClient) {
      // Sem credenciais Meta: não é possível baixar o áudio. Responder com fallback.
      const fallbackText =
        "Recebi seu áudio, mas ainda não consigo processá-lo no momento. " +
        "Por favor, envie sua pergunta por escrito.";

      if (data.channelConfig.responseMode === "n8n_webhook") {
        await dispatchNotice(data, fallbackText);
      } else {
        // direct , seria necessário cloud client também; loga e encerra sem matar o job
        console.warn("[agent-processor] Modo direct sem cloud client , resposta de áudio impossível.");
      }
      return;
    }

    const { buffer, mimeType } = await cloudClient.downloadMedia(data.audioMediaId);
    const blob = new Blob([buffer], { type: mimeType });
    const transcription = await transcribeAudio(blob, "pt");
    userMessage = transcription.text;
  } else {
    if (!data.text) {
      throw new Error("[agent-processor] text ausente para tipo=text");
    }
    userMessage = data.text;
  }

  // 1b. Lock por usuário (cluster-safe). Garante uma conversa por usuário sem
  //     sobrescrita de reasoningHistory quando chegam mensagens concorrentes.
  //     Se outra mensagem do mesmo usuário está em processamento, lança para o
  //     BullMQ retentar com backoff (espera a anterior liberar).
  const gotLock = await acquireUserLock(data.userId);
  if (!gotLock) {
    throw new Error(`[agent-processor] lock ocupado para userId=${data.userId}, retry`);
  }
  try {
    // 2. Obter ou criar conversa WhatsApp
    const conversation = await getOrCreateWhatsappConversation(data.userId);

  // 2b. Onda E do Renascimento: parser de atalho numerico (1/2/3) para
  //     sugestoes da resposta anterior. WhatsApp nao renderiza chips, o
  //     usuario responde com o numero da opcao listada. Estado em Redis,
  //     TTL 24h, scoped por userId.
  const numericShortcut = userMessage.trim().match(/^([1-9])[.)\s]*$/);
  if (numericShortcut) {
    const idx = Number(numericShortcut[1]) - 1;
    try {
      const last = await redis.get(lastSuggestionsKey(data.userId));
      if (last) {
        const arr = JSON.parse(last) as unknown;
        if (Array.isArray(arr) && typeof arr[idx] === "string") {
          userMessage = arr[idx];
        }
      }
    } catch {
      /* best-effort; ignora cache miss */
    }
  }

  // 3. Executar o agente (source=whatsapp ativa bloco do compose com sintaxe
  //    propria e instrucao "Voce tambem pode perguntar" + opcoes numeradas).
  //    Heartbeat textual suprimido no WhatsApp (decisão #9): só a resposta
  //    final (ou a mensagem padrão de barreira) é emitida.
  const result = await runAgent({
    conversationId: conversation.id,
    userId: data.userId,
    userMessage,
    channel: data.channel,
    isPlayground: false,
    source: "whatsapp",
    isAudio,
  });

  // Persiste as sugestoes do turno (extraidas pelo runAgent.suggestions
  // OU do sufixo "Voce tambem pode perguntar:" gerado pelo source whatsapp).
  // Cobre os dois caminhos: o agente pode emitir [[suggestions]] ou texto.
  const harvested = result.ok ? harvestWhatsappSuggestions(result) : [];
  if (harvested.length > 0) {
    try {
      await redis.set(
        lastSuggestionsKey(data.userId),
        JSON.stringify(harvested),
        "EX",
        24 * 60 * 60,
      );
    } catch {
      /* sem Redis, sem atalho numerico, sem prejuizo de resposta */
    }
  }

  // 4. Montar o envelope rico, gravar a idempotência de saída e despachar.
  //    A chave `whatsapp:replied` é gravada APÓS runAgent+persistência e ANTES
  //    do POST: o retry de POST falho só reentrega o payload salvo (§9).
  const replyData = buildReplyData(
    {
      inboundMessageId: data.messageId,
      to: data.replyTo,
      phoneNumberId: data.phoneNumberId ?? null,
      conversationId: conversation.id,
      messageType: data.type,
    },
    result,
  );
  await redis
    .set(replayKey, JSON.stringify(replyData), "EX", 24 * 60 * 60)
    .catch(() => {});
  await dispatchReply(data, replyData);
  } finally {
    await releaseUserLock(data.userId);
  }
}

/** Chave Redis das ultimas sugestoes WhatsApp por usuario. */
function lastSuggestionsKey(userId: string): string {
  return `nex:whatsapp:last-suggestions:${userId}:v1`;
}

/** Coleta sugestoes do resultado: prioridade ao array estruturado; depois,
 *  parse do sufixo textual "Voce tambem pode perguntar:". */
function harvestWhatsappSuggestions(result: {
  message: string;
  suggestions: string[];
}): string[] {
  if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
    return result.suggestions.slice(0, 5);
  }
  const m = result.message.match(
    /Voc(?:e|ê) tambem pode perguntar:?\s*([\s\S]+)$/i,
  );
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((line) => line.replace(/^\s*[1-9][.)]?\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
}

/**
 * Despacha o `replyData` no modo configurado. O `kind` do envelope é DERIVADO
 * de `replyData.ok` (final quando ok, blocked quando barreira/falha , inclui a
 * recusa L3 permission_denied, que volta como ok:false).
 *
 * - n8n_webhook: emite o envelope agent.reply assinado para os targets.
 * - direct:      envia o texto via Graph API (cloud client).
 */
async function dispatchReply(data: AgentJobData, replyData: AgentReplyData): Promise<void> {
  if (data.channelConfig.responseMode === "n8n_webhook") {
    await emitAgentReply(data.channelConfig.outboundTargets ?? [], {
      kind: replyData.ok ? "final" : "blocked",
      data: replyData,
    });
    return;
  }
  // Modo direct: envia via Graph API.
  const cloudClient = await buildCloudClientFromDb();
  await cloudClient.sendText(data.replyTo, replyData.reply);
}

/**
 * Aviso brando (mídia não suportada / fallback de áudio): monta um envelope
 * mínimo `ok:false`/`technical_error` com o texto fornecido e despacha.
 */
async function dispatchNotice(data: AgentJobData, text: string): Promise<void> {
  await dispatchReply(data, {
    inboundMessageId: data.messageId,
    to: data.replyTo,
    phoneNumberId: data.phoneNumberId ?? null,
    sessionId: null,
    assistantMessageId: null,
    ok: false,
    reason: "technical_error",
    reply: text,
    suggestions: [],
    tools: [],
    reasoningMs: 0,
    usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
    messageType: data.type,
  });
}
