import { randomUUID } from "node:crypto";
import { signPayload } from "@/lib/whatsapp/hmac";
import type { BlockReason } from "@/lib/whatsapp/blocked-messages";

/**
 * Dados PLANOS da resposta. Ficam planos de propósito: o replay de saída
 * serializa este objeto no Redis (idempotência §9). O formato ANINHADO da
 * SPEC §3.10 é montado dentro de `emitAgentReply`, na hora do disparo.
 */
export interface AgentReplyData {
  inboundMessageId: string;
  to: string;
  businessId: string | null;
  /** Nome da Conexão que recebeu a mensagem (SPEC A7); null em jobs antigos. */
  connectionName: string | null;
  sessionId: string | null;
  assistantMessageId: string | null;
  ok: boolean;
  /** Catálogo único de blocked-messages; null quando ok:true. */
  reason: BlockReason | null;
  reply: string;
  suggestions: string[];
  tools: string[];
  reasoningMs: number;
  /** Modelo efetivo da resposta final (SPEC A6); null em blocked/erro. */
  model: string | null;
  usage: { tokensInput: number; tokensOutput: number; costUsd: number };
  messageType: import("@/lib/whatsapp/inbound-payload").InboundMessageType;
  /** Só em permission_denied (L3). */
  deniedModule?: string;
  allowedModules?: string[];
}

export interface AgentReplyEnvelopeInput {
  kind: "final" | "blocked";
  data: AgentReplyData;
}

export interface OutboundTarget {
  url: string;
  secret: string;
}

/**
 * Emite o evento agent.reply (envelope assinado HMAC) para cada target com
 * secret válido. Fail-closed: target sem secret é pulado (não dispara).
 *
 * O envelope segue a SPEC §3.10 (aninhado). Deduplicação no consumidor deve
 * usar `message.inboundMessageId`: `deliveryId` é novo a cada disparo, e um
 * retry gera outro (SPEC A16).
 */
export async function emitAgentReply(
  targets: OutboundTarget[],
  input: AgentReplyEnvelopeInput,
): Promise<void> {
  const timestamp = Date.now();
  const d = input.data;
  const envelope = {
    event: "agent.reply" as const,
    deliveryId: randomUUID(),
    kind: input.kind,
    timestamp,
    connection: { name: d.connectionName, businessId: d.businessId },
    message: { inboundMessageId: d.inboundMessageId, to: d.to, type: d.messageType },
    session: { conversationId: d.sessionId, assistantMessageId: d.assistantMessageId },
    result: {
      ok: d.ok,
      reason: d.reason,
      reply: d.reply,
      suggestions: d.suggestions,
      deniedModule: d.deniedModule ?? null,
      allowedModules: d.allowedModules ?? [],
    },
    diagnostics: {
      tools: d.tools,
      reasoningMs: d.reasoningMs,
      model: d.model,
      usage: d.usage,
    },
  };
  const body = JSON.stringify(envelope);
  const tsStr = String(timestamp);

  for (const t of targets) {
    if (!t.url || !t.secret) continue; // fail-closed
    const signature = signPayload(body, t.secret, tsStr);
    await fetch(t.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Timestamp": tsStr,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  }
}
