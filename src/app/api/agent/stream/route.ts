/**
 * POST /api/agent/stream
 *
 * Endpoint SSE do chat do agente (Task 3.2).
 * Recebe {conversationId?, message, isPlayground?} e responde text/event-stream.
 *
 * Evento SSE contract (SPEC §8.1):
 *   data: {"type":"status","status":"thinking"}
 *   data: {"type":"token","delta":"..."}      ← streaming Anthropic
 *   data: {"type":"tool_call","toolName":"..."}
 *   data: {"type":"done","message":"...","suggestions":[...]}
 *   data: {"type":"error","error":"..."}
 */

import { getCurrentUser } from "@/lib/auth";
import { runAgent } from "@/lib/agent/run-agent";
import { createConversation, assertConversationOwned } from "@/lib/agent/conversation";
import type { AgentEvent } from "@/lib/agent/run-agent";

const encoder = new TextEncoder();

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { conversationId?: string; message?: string; isPlayground?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return new Response(JSON.stringify({ error: "message é obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolver conversationId: usar existente ou criar nova
  let conversationId: string;
  if (body.conversationId) {
    try {
      await assertConversationOwned(body.conversationId, user.id);
    } catch {
      return new Response(JSON.stringify({ error: "Conversa não encontrada ou acesso negado" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    conversationId = body.conversationId;
  } else {
    const conv = await createConversation(user.id, "in_app");
    conversationId = conv.id;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        try {
          controller.enqueue(sseEvent(data));
        } catch {
          // stream fechado
        }
      }

      function onEvent(evt: AgentEvent) {
        if (evt.type === "thinking") {
          emit({ type: "status", status: "thinking" });
        } else if (evt.type === "tool_call") {
          emit({ type: "tool_call", toolName: evt.toolName });
        } else if (evt.type === "tool_result") {
          emit({ type: "tool_result", toolName: evt.toolName, truncated: evt.truncated });
        } else if (evt.type === "done") {
          // done é emitido pelo resultado final abaixo
        }
      }

      try {
        const result = await runAgent({
          conversationId,
          userId: user.id,
          userMessage: body.message!.trim(),
          channel: "in_app",
          isPlayground: body.isPlayground ?? false,
          onEvent,
        });

        if (result.ok) {
          emit({
            type: "done",
            conversationId,
            message: result.message,
            suggestions: result.suggestions,
          });
        } else {
          emit({ type: "error", error: result.error });
        }
      } catch (err) {
        emit({
          type: "error",
          error: err instanceof Error ? err.message : "Erro interno",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
