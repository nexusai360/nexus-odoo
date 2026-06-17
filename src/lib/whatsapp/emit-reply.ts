import { randomUUID } from "node:crypto";
import { signPayload } from "@/lib/whatsapp/hmac";
import type { BlockReason } from "@/lib/whatsapp/blocked-messages";

export interface AgentReplyData {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  sessionId: string | null;
  assistantMessageId: string | null;
  ok: boolean;
  /** Catálogo único de blocked-messages; null quando ok:true. */
  reason: BlockReason | null;
  reply: string;
  suggestions: string[];
  tools: string[];
  reasoningMs: number;
  usage: { tokensInput: number; tokensOutput: number; costUsd: number };
  messageType: "text" | "audio" | "image";
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
 */
export async function emitAgentReply(
  targets: OutboundTarget[],
  input: AgentReplyEnvelopeInput,
): Promise<void> {
  const timestamp = Date.now();
  const envelope = {
    event: "agent.reply" as const,
    deliveryId: randomUUID(),
    kind: input.kind,
    data: input.data,
    timestamp,
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
