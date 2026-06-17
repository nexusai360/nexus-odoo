import type { AgentReplyData } from "@/lib/whatsapp/emit-reply";
import { blockedMessageFor } from "@/lib/whatsapp/blocked-messages";
import { formatForChannel } from "@/lib/agent/format/by-channel";
import type { RunAgentResult } from "@/lib/agent/run-agent";

/** Contexto da mensagem inbound necessário para montar o envelope agent.reply. */
export interface ReplyContext {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  conversationId: string | null;
  messageType: "text" | "audio" | "image";
}

/**
 * Mapeia o resultado do agente para o `data` do envelope `agent.reply`.
 *
 * Três caminhos:
 * - ok final: `ok:true`, texto formatado p/ WhatsApp, tools/reasoning/usage do turno.
 * - recusa L3 (`result.deniedModule` presente): `ok:false`/`permission_denied`,
 *   tools/reasoning zerados, módulos desejado/permitidos preenchidos. O `reply`
 *   é o template enriquecido que `respondPermissionDenied` montou (`result.message`).
 * - falha técnica (`result.ok=false`): `ok:false`/`technical_error`, texto do catálogo.
 *
 * O catálogo único de blocked-messages é a fonte dos textos de bloqueio (sem
 * literal solto), mantendo o tipo `BlockReason` consistente.
 */
export function buildReplyData(
  ctx: ReplyContext,
  result: RunAgentResult,
): AgentReplyData {
  const baseUsage = { tokensInput: 0, tokensOutput: 0, costUsd: 0 };

  if (!result.ok) {
    return {
      inboundMessageId: ctx.inboundMessageId,
      to: ctx.to,
      phoneNumberId: ctx.phoneNumberId,
      sessionId: ctx.conversationId,
      assistantMessageId: null,
      ok: false,
      reason: "technical_error",
      reply: blockedMessageFor("technical_error"),
      suggestions: [],
      tools: [],
      reasoningMs: 0,
      usage: baseUsage,
      messageType: ctx.messageType,
    };
  }

  const isDenied = typeof result.deniedModule === "string";

  return {
    inboundMessageId: ctx.inboundMessageId,
    to: ctx.to,
    phoneNumberId: ctx.phoneNumberId,
    sessionId: ctx.conversationId,
    assistantMessageId: result.messageId,
    ok: !isDenied,
    reason: isDenied ? "permission_denied" : null,
    reply: formatForChannel(result.message, "whatsapp"),
    suggestions: isDenied ? [] : result.suggestions,
    tools: isDenied ? [] : result.toolsCalled,
    reasoningMs: isDenied ? 0 : result.reasoningMs,
    usage: isDenied
      ? baseUsage
      : {
          tokensInput: result.usage.tokensInput,
          tokensOutput: result.usage.tokensOutput,
          costUsd: result.usage.costUsd,
        },
    messageType: ctx.messageType,
    ...(isDenied
      ? {
          deniedModule: result.deniedModule,
          allowedModules: result.allowedModules ?? [],
        }
      : {}),
  };
}
