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
import { getOrCreateWhatsappConversation } from "@/lib/agent/conversation";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { buildCloudClientFromDb } from "@/lib/whatsapp/cloud-client";
import { signPayload } from "@/lib/whatsapp/hmac";
import type { AgentChannel } from "@/generated/prisma/client";

/** Mensagem de erro amigável enviada ao usuário quando o agente falha. */
const AGENT_ERROR_MSG =
  "Desculpe, não consegui processar sua mensagem agora. Tente novamente em instantes.";

export interface AgentJobChannelConfig {
  responseMode: "direct" | "n8n_webhook";
  /** Presente quando responseMode = n8n_webhook */
  outboundUrl?: string;
  /** Secret HMAC para assinar o payload de saída (n8n_webhook) */
  outboundSecret?: string;
}

export interface AgentJobData {
  /** ID da mensagem WhatsApp — chave de dedup (já registrada no inbound). */
  messageId: string;
  /** ID do usuário da plataforma (resolvido pelo inbound). */
  userId: string;
  /** Canal do agente — sempre "whatsapp" para jobs desta fila. */
  channel: AgentChannel;
  /** Tipo da mensagem. */
  type: "text" | "audio";
  /** Texto da mensagem (presente quando type=text). */
  text?: string;
  /** Media ID para download do áudio (presente quando type=audio). */
  audioMediaId?: string;
  /** Número de destino para a resposta (E.164). */
  replyTo: string;
  /** Configuração de resposta do canal. */
  channelConfig: AgentJobChannelConfig;
}

/**
 * Processa um job da fila `agent`.
 * Exportado como função para facilitar testes sem BullMQ.
 */
export async function processAgentJob(data: AgentJobData): Promise<void> {
  // 1. Resolver texto da mensagem (text ou áudio transcrito)
  let userMessage: string;

  if (data.type === "audio") {
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
        await sendViaWebhook(data, fallbackText);
      } else {
        // direct — seria necessário cloud client também; loga e encerra sem matar o job
        console.warn("[agent-processor] Modo direct sem cloud client — resposta de áudio impossível.");
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

  // 2. Obter ou criar conversa WhatsApp
  const conversation = await getOrCreateWhatsappConversation(data.userId);

  // 3. Executar o agente
  const result = await runAgent({
    conversationId: conversation.id,
    userId: data.userId,
    userMessage,
    channel: data.channel,
    isPlayground: false,
  });

  const replyText = result.ok ? result.message : AGENT_ERROR_MSG;

  // 4. Despachar resposta no modo configurado
  const { responseMode } = data.channelConfig;

  if (responseMode === "n8n_webhook") {
    await sendViaWebhook(data, replyText);
  } else {
    // Modo direct: envia via Graph API
    const cloudClient = await buildCloudClientFromDb();
    await cloudClient.sendText(data.replyTo, replyText);
  }
}

/**
 * Modo n8n_webhook: POST assinado HMAC no outboundUrl configurado.
 * O n8n recebe o payload e repassa ao WhatsApp.
 */
async function sendViaWebhook(data: AgentJobData, replyText: string): Promise<void> {
  const { outboundUrl, outboundSecret } = data.channelConfig;

  if (!outboundUrl) {
    // Lança para que o BullMQ reprocesse com backoff — não silenciar perda de resposta.
    throw new Error("[agent-processor] outboundUrl ausente para modo n8n_webhook");
  }

  const timestamp = String(Date.now());
  const body = JSON.stringify({
    to: data.replyTo,
    message: replyText,
    messageId: data.messageId,
    timestamp,
  });

  const signature = outboundSecret ? signPayload(body, outboundSecret, timestamp) : "";

  const response = await fetch(outboundUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": timestamp,
    },
    body,
    signal: AbortSignal.timeout(15_000), // 15s timeout — evita job pendurando
  });

  if (!response.ok) {
    // Lança para que o BullMQ reprocesse com backoff exponencial.
    throw new Error(
      `[agent-processor] Webhook de saída falhou (${response.status}): ${outboundUrl}`,
    );
  }
}
