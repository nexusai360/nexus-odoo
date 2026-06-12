/**
 * Processor do job `agent-resumo-conversa` (Onda M , Arquitetura 3.0, M.5).
 *
 * Re-gera o resumo progressivo (L2 da memoria) de uma conversa SEMPRE a partir
 * das mensagens originais (nunca resumo-de-resumo), com o modelo ativo (mini),
 * cap de tokens, conteudo factual com numeros + proveniencia.
 *
 * Idempotencia: re-roda quando ha >= RESUMO_THRESHOLD_NOVAS_MSGS mensagens
 * novas desde `Conversation.resumoAtualizadoEm` (forcar = resumoAtualizadoEm
 * null, usado pelo RBAC lazy quando um dominio do resumo foi revogado).
 *
 * RBAC na fonte: mensagem assistant cujo toolDigest e de dominio fora do
 * acesso atual do DONO da conversa fica fora do transcript; os dominios
 * efetivamente incluidos sao gravados em `resumoDominios` (gate da injecao).
 */

import { prisma } from "@/lib/prisma";
import { getActiveLlmConfig } from "@/lib/agent/llm/get-active-config";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import { seesAll } from "@/lib/reports/domains";
import {
  RESUMO_MAX_MENSAGENS,
  RESUMO_MAX_TOKENS,
  deveResumir,
  extrairDominioDoDigest,
  montarPromptResumo,
} from "@/lib/agent/memoria/resumo-progressivo";

export async function processResumoConversaJob(data: {
  conversationId: string;
}): Promise<{ ok: true; skipped?: boolean }> {
  const { conversationId } = data;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userId: true,
      resumoAtualizadoEm: true,
      resumoAteMensagemId: true,
    },
  });
  if (!conv) {
    console.warn("[resumo-conversa] conversa nao encontrada:", conversationId);
    return { ok: true, skipped: true };
  }

  // Regra de disparo: novas mensagens desde o ultimo resumo.
  const novas = await prisma.message.count({
    where: {
      conversationId,
      ...(conv.resumoAtualizadoEm ? { createdAt: { gt: conv.resumoAtualizadoEm } } : {}),
    },
  });
  if (!deveResumir(novas)) return { ok: true, skipped: true };

  // Dominios permitidos do DONO da conversa (mesma logica do run-agent).
  const user = await prisma.user.findUnique({
    where: { id: conv.userId },
    select: { platformRole: true },
  });
  let allowed: Set<string> | "all" = new Set<string>();
  if (user?.platformRole && seesAll(user.platformRole)) {
    allowed = "all";
  } else if (user?.platformRole) {
    try {
      const granted = await prisma.userDomainAccess.findMany({
        where: { userId: conv.userId },
        select: { domain: true },
      });
      allowed = new Set(granted.map((g) => g.domain));
    } catch {
      allowed = new Set();
    }
  }

  // Mensagens originais (mais recentes), em ordem cronologica.
  const desc = await prisma.message.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    take: RESUMO_MAX_MENSAGENS,
    select: { id: true, role: true, content: true, toolDigest: true, createdAt: true },
  });
  const asc = desc.slice().reverse();
  if (asc.length === 0) return { ok: true, skipped: true };

  // RBAC na fonte: assistant com digest de dominio revogado fica fora.
  const dominios = new Set<string>();
  const incluidas: { role: string; content: string; toolDigest?: string | null }[] = [];
  for (const m of asc) {
    const dominio = m.toolDigest ? extrairDominioDoDigest(m.toolDigest) : null;
    if (dominio && allowed !== "all" && !allowed.has(dominio)) continue;
    if (dominio) dominios.add(dominio);
    incluidas.push(m);
  }
  if (incluidas.length === 0) return { ok: true, skipped: true };

  const llm = await getActiveLlmConfig();
  if (!llm) return { ok: true, skipped: true };

  const prompt = montarPromptResumo(incluidas);
  const client = buildLlmClient(llm.provider, llm.apiKey, llm.model);
  const result = await client.chat({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.1,
    maxTokens: RESUMO_MAX_TOKENS,
  });

  const resumo = (result.message ?? "").trim();
  if (!resumo) return { ok: true, skipped: true };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      resumoProgressivo: resumo,
      resumoAteMensagemId: asc[asc.length - 1].id,
      resumoAtualizadoEm: new Date(),
      resumoDominios: [...dominios],
    },
  });

  return { ok: true };
}
