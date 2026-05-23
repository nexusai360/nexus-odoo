/**
 * POST /api/agent/playground/stream
 *
 * Endpoint SSE do playground de sessões persistentes do Agente Nex.
 * Diferente de /api/agent/stream: opera sobre uma PlaygroundSession,
 * usa o provedor/modelo e o snapshot de prompt da sessão (independentes
 * da produção) e persiste as mensagens em PlaygroundMessage.
 *
 * Body: { sessionId, message }
 * Eventos SSE: idênticos a /api/agent/stream.
 *
 * Bloco 6 — F5 UI rework v2.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAgent, type AgentEvent } from "@/lib/agent/run-agent";
import { createConversation } from "@/lib/agent/conversation";
import { getDecryptedKey } from "@/lib/agent/llm/credentials";
import type { LlmProvider } from "@/lib/agent/llm/types";

const PLAYGROUND_ROLES = new Set(["admin", "super_admin"]);
const encoder = new TextEncoder();

function sse(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface PromptSnapshot {
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
}

function parseSnapshot(json: unknown): PromptSnapshot {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    identityBase: typeof o.identityBase === "string" ? o.identityBase : null,
    personality: typeof o.personality === "string" ? o.personality : "",
    tone: typeof o.tone === "string" ? o.tone : "",
    guardrails: Array.isArray(o.guardrails)
      ? o.guardrails.filter((g): g is string => typeof g === "string")
      : [],
  };
}

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Não autenticado", 401);
  if (!PLAYGROUND_ROLES.has(user.platformRole)) {
    return jsonError("Acesso negado ao playground", 403);
  }

  let body: {
    sessionId?: string;
    message?: string;
    meta?: {
      source?: "bubble" | "suggestion" | "whatsapp" | "playground";
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Body inválido", 400);
  }
  if (!body.sessionId || typeof body.sessionId !== "string") {
    return jsonError("sessionId é obrigatório", 400);
  }
  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return jsonError("message é obrigatório", 400);
  }

  // Carregar a sessão de playground (ownership)
  const session = await prisma.playgroundSession.findFirst({
    where: { id: body.sessionId, userId: user.id },
  });
  if (!session) return jsonError("Sessão não encontrada", 404);

  if (!session.provider || !session.model) {
    return jsonError(
      "Configure provedor, modelo e chave de API da sessão antes de enviar mensagens.",
      400,
    );
  }

  // D2 — preferir a credencial registrada na sessão; fallback para a chave
  // mais recente do provedor escolhido.
  let credentialId: string | null = session.credentialId ?? null;
  if (credentialId) {
    const exists = await prisma.llmCredential.findFirst({
      where: { id: credentialId, provider: session.provider },
      select: { id: true },
    });
    if (!exists) credentialId = null;
  }
  if (!credentialId) {
    const fallback = await prisma.llmCredential.findFirst({
      where: { provider: session.provider },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!fallback) {
      return jsonError(
        `Nenhuma chave de API cadastrada para ${session.provider}.`,
        400,
      );
    }
    credentialId = fallback.id;
  }
  const apiKey = await getDecryptedKey(credentialId);
  if (!apiKey) return jsonError("Falha ao decifrar a chave de API.", 500);

  // Garantir a conversa (canal playground) ligada à sessão
  let conversationId = session.conversationId;
  if (!conversationId) {
    const conv = await createConversation(user.id, "playground");
    conversationId = conv.id;
    await prisma.playgroundSession.update({
      where: { id: session.id },
      data: { conversationId },
    });
  }

  const snapshot = parseSnapshot(session.promptSnapshot);
  const userMessage = body.message.trim();

  // Persistir a mensagem do usuário no histórico da sessão (D5 — tipo texto).
  await prisma.playgroundMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: userMessage,
      requestKind: "texto",
    },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        try {
          controller.enqueue(sse(data));
        } catch {
          /* stream fechado */
        }
      }

      function onEvent(evt: AgentEvent) {
        if (evt.type === "thinking") emit({ type: "status", status: "thinking" });
        else if (evt.type === "token") emit({ type: "token", delta: evt.delta });
        else if (evt.type === "tool_call")
          emit({ type: "tool_call", toolName: evt.toolName, label: evt.label });
        else if (evt.type === "tool_result")
          emit({
            type: "tool_result",
            toolName: evt.toolName,
            truncated: evt.truncated,
            label: evt.label,
          });
      }

      try {
        const result = await runAgent({
          conversationId: conversationId!,
          userId: user.id,
          userMessage,
          channel: "playground",
          isPlayground: true,
          onEvent,
          promptConfigOverride: snapshot,
          llmOverride: {
            provider: session.provider as LlmProvider,
            model: session.model,
            apiKey,
          },
          source: body.meta?.source ?? "playground",
        });

        if (result.ok) {
          // Persistir resposta do assistente na sessão (D5 — registra provedor
          // e modelo que geraram a resposta, p/ exibir tag por turn).
          await prisma.playgroundMessage.create({
            data: {
              sessionId: session.id,
              role: "assistant",
              content: result.message,
              costUsd: result.usage.costUsd || null,
              provider: session.provider,
              model: session.model,
              requestKind: "texto",
            },
          });

          // Recalcular custo acumulado da sessão a partir de LlmUsage real
          const agg = await prisma.llmUsage.aggregate({
            where: { conversationId: conversationId! },
            _sum: { costUsd: true, costBrl: true },
          });
          await prisma.playgroundSession.update({
            where: { id: session.id },
            data: {
              costUsd: agg._sum.costUsd ?? 0,
              costBrl: agg._sum.costBrl ?? 0,
            },
          });

          emit({
            type: "done",
            sessionId: session.id,
            message: result.message,
            suggestions: result.suggestions,
            costUsd: Number(agg._sum.costUsd ?? 0),
            costBrl: Number(agg._sum.costBrl ?? 0),
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
