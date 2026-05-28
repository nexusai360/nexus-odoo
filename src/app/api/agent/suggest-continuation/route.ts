/**
 * POST /api/agent/suggest-continuation
 *
 * Gera 3 chips de continuidade contextuais (Frente C da inteligencia) para
 * uma conversa do usuario autenticado.
 *
 * Body:
 *   { conversationId: string, maxChips?: number }
 *
 * Response 200:
 *   { chips: string[], source: "ok"|"timeout"|"error"|"empty_context" }
 *
 * Erros:
 *   401 , sem sessao
 *   403 , conversa nao pertence ao usuario
 *   429 , rate limit (30/min por usuario)
 *   400 , body invalido
 *
 * Respeita `AgentSettings.intelligenceCheckpoint` (OFF → retorna chips vazios).
 * Respeita `AgentSettings.suggestionsCheckpoint` (OFF → retorna chips vazios).
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §5.4
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentAccessOrJson } from "@/lib/auth/require";
import { checkRateLimit } from "@/lib/rate-limit";
import { suggestContinuation } from "@/lib/agent/intelligence/contextual-suggester";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  maxChips: z.number().int().min(1).max(7).optional(),
});

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RBAC v2: gate de acesso ao agente.
  const access = await requireAgentAccessOrJson();
  if (access instanceof NextResponse) return access;
  const { user } = access;

  // Rate limit
  const rl = await checkRateLimit(
    `suggest_continuation:user:${user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SEC,
  ).catch(() => ({ allowed: true, remaining: 0 }));
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  // Body
  let body: z.infer<typeof bodySchema>;
  try {
    const json = (await req.json()) as unknown;
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  // Conferir scope: a conversa precisa pertencer ao usuario.
  const conv = await prisma.conversation.findUnique({
    where: { id: body.conversationId },
    select: { userId: true },
  });
  if (!conv) {
    return NextResponse.json({ error: "Conversa nao encontrada" }, { status: 404 });
  }
  if (conv.userId !== user.id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Checkpoints , qualquer um OFF zera o retorno.
  const settings = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { intelligenceCheckpoint: true, suggestionsCheckpoint: true },
  });
  if (
    settings?.intelligenceCheckpoint === "OFF" ||
    settings?.suggestionsCheckpoint === "OFF"
  ) {
    return NextResponse.json({ chips: [], source: "empty_context" });
  }

  const result = await suggestContinuation({
    conversationId: body.conversationId,
    maxChips: body.maxChips,
  });

  return NextResponse.json(result);
}
