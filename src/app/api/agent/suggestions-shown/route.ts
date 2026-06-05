/**
 * POST /api/agent/suggestions-shown
 *
 * Persiste o conjunto EXATO de chips de sugestão que a bubble exibiu abaixo de
 * uma resposta do assistant. É a única fonte fiel do "que o usuário viu": o
 * conjunto final é montado no cliente (suggester contextual → inline/welcome →
 * padding com HARD_FALLBACK), e nada disso é reconstruível no servidor. Sem
 * este snapshot, o painel de monitoramento (coluna Conversa) não tem como
 * espelhar a tela do usuário.
 *
 * Grava em `ConversationQualityEvaluation.suggestions` da mensagem assistant
 * (keyada por `assistantMessageId`), sobrescrevendo o snapshot cru que o
 * `createPendingEval` salvou no fim do turno.
 *
 * Body:
 *   { messageId: string (uuid), suggestions: string[] }
 *
 * Response 200: { ok: true }
 * Erros: 401 sem sessão · 403 mensagem não é do usuário · 404 mensagem
 *        inexistente · 400 body inválido.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentAccessOrJson } from "@/lib/auth/require";

const bodySchema = z.object({
  messageId: z.string().uuid(),
  // Cap defensivo: no máx 7 chips, cada uma trimada e limitada (alinha com o
  // teto da SuggestionsBar e evita payload abusivo).
  suggestions: z
    .array(z.string().trim().min(1).max(300))
    .max(7),
});

// A eval da resposta é criada fire-and-forget no fim do turno; quando o
// suggester contextual resolve rápido, o cliente pode chamar este endpoint
// antes da row existir. Pequeno retry cobre essa janela sem bloquear o usuário.
const RETRY_DELAYS_MS = [0, 400, 800];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = await requireAgentAccessOrJson();
  if (access instanceof NextResponse) return access;
  const { user } = access;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse((await req.json()) as unknown);
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  // Escopo: a mensagem precisa ser de uma conversa do próprio usuário.
  const msg = await prisma.message.findUnique({
    where: { id: body.messageId },
    select: { role: true, conversation: { select: { userId: true } } },
  });
  if (!msg) {
    return NextResponse.json({ error: "Mensagem nao encontrada" }, { status: 404 });
  }
  if (msg.conversation.userId !== user.id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Só faz sentido para respostas do assistant.
  if (msg.role !== "assistant") {
    return NextResponse.json({ ok: true });
  }

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const { count } = await prisma.conversationQualityEvaluation.updateMany({
        where: { assistantMessageId: body.messageId },
        data: { suggestions: body.suggestions },
      });
      if (count > 0) break;
    } catch (err) {
      console.warn("[suggestions-shown] update falhou:", err);
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
