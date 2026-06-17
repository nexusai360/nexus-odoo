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
import { formatForChannel } from "@/lib/agent/format/by-channel";
import { redis } from "@/lib/redis";
import { getOrCreateWhatsappConversation } from "@/lib/agent/conversation";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { buildCloudClientFromDb } from "@/lib/whatsapp/cloud-client";
import { signPayload } from "@/lib/whatsapp/hmac";
import { prisma } from "@/lib/prisma";
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
  /** ID da mensagem WhatsApp , chave de dedup (já registrada no inbound). */
  messageId: string;
  /** ID do usuário da plataforma (resolvido pelo inbound). */
  userId: string;
  /** Canal do agente , sempre "whatsapp" para jobs desta fila. */
  channel: AgentChannel;
  /** Tipo da mensagem. */
  type: "text" | "audio" | "image";
  /** Texto da mensagem (presente quando type=text). */
  text?: string;
  /** Media ID para download do áudio (presente quando type=audio). */
  audioMediaId?: string;
  /** Media ID para download da imagem (presente quando type=image). */
  imageMediaId?: string;
  /** Número de destino para a resposta (E.164). */
  replyTo: string;
  /** ID do número Meta para rotear a resposta (opcional). */
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
  // G2 , Regras de comportamento para WhatsApp baseadas nos checkpoints
  // configurados em AgentSettings. "PRODUCTION" libera o recurso para o
  // WhatsApp; outros valores indicam que o canal não deve processar mídia.
  const settings = await prisma.agentSettings.findFirst().catch(() => null);
  const audioInProduction = settings?.audioCheckpoint === "PRODUCTION";
  const imageInProduction = settings?.imageCheckpoint === "PRODUCTION";

  if (data.type === "image") {
    // G2 , Imagem desativada para WhatsApp: ignorar silenciosamente
    // (sem resposta). Quando habilitado, ainda não há pipeline de visão
    // dedicado; responde com aviso provisório.
    if (!imageInProduction) {
      console.info(
        `[agent-processor] Mensagem de imagem ignorada (imageCheckpoint != PRODUCTION) , messageId=${data.messageId}`,
      );
      return;
    }
    const provisional =
      "Recebi sua imagem, mas a análise de imagens ainda está em ajustes finais. Em instantes consigo responder a essa modalidade.";
    if (data.channelConfig.responseMode === "n8n_webhook") {
      await sendViaWebhook(data, provisional);
    } else {
      const cloudClient = await buildCloudClientFromDb();
      await cloudClient.sendText(data.replyTo, provisional);
    }
    return;
  }

  if (data.type === "audio" && !audioInProduction) {
    // G2 , Áudio desativado para WhatsApp: responder explicando.
    const message =
      "No momento não consigo entender mensagens de áudio. Por favor, envie sua pergunta por escrito.";
    if (data.channelConfig.responseMode === "n8n_webhook") {
      await sendViaWebhook(data, message);
    } else {
      const cloudClient = await buildCloudClientFromDb();
      await cloudClient.sendText(data.replyTo, message);
    }
    return;
  }

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

  // 2c. Heartbeat textual: se o agente demorar mais de 3s, envia uma
  //     mensagem curta para o usuario nao achar que travou. Hard limit 1
  //     por turno; cancelado se o runAgent completar antes.
  const heartbeatTimer = scheduleWhatsappHeartbeat(data);

  // 3. Executar o agente (source=whatsapp ativa bloco do compose com sintaxe
  //    propria e instrucao "Voce tambem pode perguntar" + opcoes numeradas).
  let result: Awaited<ReturnType<typeof runAgent>>;
  try {
    result = await runAgent({
      conversationId: conversation.id,
      userId: data.userId,
      userMessage,
      channel: data.channel,
      isPlayground: false,
      source: "whatsapp",
    });
  } finally {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
  }

  const replyTextRaw = result.ok ? result.message : AGENT_ERROR_MSG;
  // Formatter por canal: converte markdown bubble (**bold**) para WhatsApp
  // (*bold*), tabelas viram listas hifenizadas, links viram texto: url.
  const replyText = formatForChannel(replyTextRaw, "whatsapp");

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

/** Agenda envio de heartbeat textual apos 3s. Retorna o handle do timer
 *  (ou null se o canal nao permite envio de feedback intermediario). */
function scheduleWhatsappHeartbeat(data: AgentJobData): NodeJS.Timeout | null {
  const HEARTBEAT_DELAY_MS = 3_000;
  const candidates = ["🔎 Buscando...", "🧮 Calculando...", "📊 Organizando..."];
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  return setTimeout(async () => {
    try {
      if (data.channelConfig.responseMode === "n8n_webhook") {
        await sendViaWebhook(data, pick);
      } else {
        const cloudClient = await buildCloudClientFromDb();
        await cloudClient.sendText(data.replyTo, pick);
      }
    } catch (err) {
      console.warn("[agent-processor] heartbeat falhou:", err);
    }
  }, HEARTBEAT_DELAY_MS);
}

/**
 * Modo n8n_webhook: POST assinado HMAC no outboundUrl configurado.
 * O n8n recebe o payload e repassa ao WhatsApp.
 */
async function sendViaWebhook(data: AgentJobData, replyText: string): Promise<void> {
  const { outboundUrl, outboundSecret } = data.channelConfig;

  if (!outboundUrl) {
    // Lança para que o BullMQ reprocesse com backoff , não silenciar perda de resposta.
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
    signal: AbortSignal.timeout(15_000), // 15s timeout , evita job pendurando
  });

  if (!response.ok) {
    // Lança para que o BullMQ reprocesse com backoff exponencial.
    throw new Error(
      `[agent-processor] Webhook de saída falhou (${response.status}): ${outboundUrl}`,
    );
  }
}
