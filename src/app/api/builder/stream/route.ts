/**
 * POST /api/builder/stream
 *
 * F6 (chat = Nex) , endpoint SSE do Construtor de relatorios. Espelha
 * /api/agent/stream: roda o runBuilder emitindo tool_call/tool_result ao vivo
 * (para a trilha "Raciocinio" da bolha) e persiste a conversa + a ficha.
 *
 * Contrato de eventos:
 *   data: {"type":"status","status":"thinking"}
 *   data: {"type":"tool_call","toolName":"...","label":"...","toolCallId":"..."}
 *   data: {"type":"tool_result","toolName":"...","label":"...","toolCallId":"..."}
 *   data: {"type":"done","conversationId","message","messageId","savedId?","etag?",
 *          "ficha?","steps":[{label}],"durationMs","recusa?","bloqueado?","erro?"}
 *   data: {"type":"error","error":"..."}
 *
 * Gate: admin/super_admin (mesmo do construirRelatorio). F6 so local.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runBuilder, type BuilderRunEvent } from "@/lib/reports/builder/agent/run-builder";
import {
  criarRascunho,
  atualizarRascunho,
  EtagConflitoError,
} from "@/lib/reports/builder/saved-report-repo";
import {
  criarBuilderConversa,
  assertBuilderConversaOwned,
  persistBuilderMensagem,
  setBuilderSavedReport,
} from "@/lib/reports/builder/builder-conversation-repo";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

const encoder = new TextEncoder();

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  // Gate admin/super_admin (construtor e restrito).
  const user = await getCurrentUser();
  if (!user) return jsonError("Nao autenticado", 401);
  if (user.platformRole !== "admin" && user.platformRole !== "super_admin") {
    return jsonError("Acesso negado", 403);
  }

  let body: { conversationId?: string; message?: string; isAudio?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Body invalido", 400);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return jsonError("message e obrigatorio", 400);

  // Resolve a conversa: existente (com checagem de dono) ou cria nova.
  let conversationId: string;
  let savedReportId: string | null = null;
  if (body.conversationId) {
    try {
      await assertBuilderConversaOwned(body.conversationId, user.id);
    } catch {
      return jsonError("Conversa nao encontrada ou acesso negado", 403);
    }
    conversationId = body.conversationId;
    const conv = await prisma.builderConversation.findUnique({
      where: { id: conversationId },
      select: { savedReportId: true },
    });
    savedReportId = conv?.savedReportId ?? null;
  } else {
    const conv = await criarBuilderConversa(user.id);
    conversationId = conv.id;
  }

  // Ficha atual (autoritativa do servidor): a do SavedReport vinculado, se houver.
  let fichaAtual: BuilderReportEntry | null = null;
  let etagAtual: string | null = null;
  if (savedReportId) {
    const sr = await prisma.savedReport.findUnique({
      where: { id: savedReportId },
      select: { entry: true, etag: true, criadoPor: true },
    });
    if (sr && sr.criadoPor === user.id) {
      fichaAtual = sr.entry as unknown as BuilderReportEntry;
      etagAtual = sr.etag;
    } else {
      // Vinculo orfao (ficha removida/de outro dono): recomeca a ficha.
      savedReportId = null;
    }
  }

  // Persiste a mensagem do usuario (kind=audio quando veio de voz).
  await persistBuilderMensagem(conversationId, "user", message, {
    kind: body.isAudio ? "audio" : "text",
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        try {
          controller.enqueue(sseEvent(data));
        } catch {
          // stream fechado pelo cliente
        }
      }

      emit({ type: "status", status: "thinking" });

      function onEvent(evt: BuilderRunEvent) {
        if (evt.type === "tool_call") {
          emit({
            type: "tool_call",
            toolName: evt.toolName,
            label: evt.label,
            toolCallId: evt.toolCallId,
          });
        } else if (evt.type === "tool_result") {
          emit({
            type: "tool_result",
            toolName: evt.toolName,
            label: evt.label,
            toolCallId: evt.toolCallId,
          });
        }
      }

      try {
        const result = await runBuilder({
          prompt: message,
          fichaAtual,
          user: { id: user.id },
          onEvent,
        });

        const steps = result.toolsCalled;
        const durationMs = result.reasoningMs;

        // Persiste/atualiza a ficha quando o turno produziu uma valida e nao
        // foi recusa/bloqueio/erro tecnico.
        let savedId: string | undefined = savedReportId ?? undefined;
        let etag: string | undefined;
        if (!result.recusa && !result.bloqueado && !result.erro && result.ficha) {
          try {
            if (savedReportId && etagAtual) {
              const upd = await atualizarRascunho(
                savedReportId,
                user.id,
                result.ficha,
                etagAtual,
              );
              if (upd) {
                savedId = upd.id;
                etag = upd.etag;
              }
            }
            if (!etag) {
              const criado = await criarRascunho(user.id, result.ficha);
              savedId = criado.id;
              etag = criado.etag;
              await setBuilderSavedReport(conversationId, criado.id);
            }
            // Mantem o titulo da conversa em dia com o da ficha.
            await prisma.builderConversation
              .update({
                where: { id: conversationId },
                data: { title: result.ficha.titulo, savedReportId: savedId },
              })
              .catch(() => {});
          } catch (err) {
            if (!(err instanceof EtagConflitoError)) throw err;
            // Conflito de etag (raro, edicao concorrente): cria nova ficha.
            const criado = await criarRascunho(user.id, result.ficha);
            savedId = criado.id;
            etag = criado.etag;
            await setBuilderSavedReport(conversationId, criado.id);
          }
        }

        // Persiste a resposta do assistant (com a trilha + duracao do turno).
        const messageId = await persistBuilderMensagem(
          conversationId,
          "assistant",
          result.mensagem,
          { steps, durationMs },
        );

        emit({
          type: "done",
          conversationId,
          message: result.mensagem,
          messageId,
          steps,
          durationMs,
          ...(savedId ? { savedId } : {}),
          ...(etag ? { etag } : {}),
          ...(result.ficha ? { ficha: result.ficha } : {}),
          ...(result.recusa ? { recusa: true } : {}),
          ...(result.bloqueado ? { bloqueado: true } : {}),
          ...(result.erro ? { erro: true } : {}),
        });
      } catch (err) {
        emit({
          type: "error",
          error: err instanceof Error ? err.message : "Erro interno do construtor",
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
