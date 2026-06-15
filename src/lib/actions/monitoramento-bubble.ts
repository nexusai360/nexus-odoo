"use server";

/**
 * B2. Monitoramento das conversas da bubble do Nex (canal in_app), para
 * super_admin. Leitura exclusiva do cache interno (Postgres da plataforma):
 * jamais toca Odoo nem o MCP (decisões #1 e #2 do CLAUDE.md).
 *
 * Duas leituras: colaboradores (agregado por usuário) e sessões de um usuário.
 */

import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/auth/require";
import { progressLabel } from "@/lib/agent/progress-labels";
import type { ConversationMessageDto } from "@/lib/actions/conversation-messages";
import {
  computeAccuracy,
  periciaBucket,
  zeroCounts,
  type RatingCounts,
} from "./monitoramento-bubble-helpers";

/** Par de métricas mostrado em cada card: AVALIAÇÃO (usuário) + PERÍCIA (plataforma). */
export type QualityPair = {
  /** Votos do usuário (MessageFeedback). */
  avaliacaoCounts: RatingCounts;
  avaliacaoPct: number | null;
  /** Vereditos do juiz (ConversationQualityEvaluation, status efetivo). */
  periciaCounts: RatingCounts;
  periciaPct: number | null;
};

export type Collaborator = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Papel de plataforma (nível de acesso) do colaborador. */
  role: string;
  sessionCount: number;
  hasActiveSession: boolean;
} & QualityPair;

export type SessionRow = {
  conversationId: string;
  index: number;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  isActive: boolean;
} & QualityPair;

/**
 * Lista os colaboradores que conversaram com o Nex na bubble (in_app),
 * com contagem de sessões, sessão ativa, votos e acurácia. Ordenado pela
 * última atividade (mais recente primeiro).
 */
export async function listBubbleCollaborators(): Promise<Collaborator[]> {
  await requireMinRole("super_admin");

  const grouped = await prisma.conversation.groupBy({
    by: ["userId"],
    where: { channel: "in_app" },
    _count: { _all: true },
    _max: { updatedAt: true },
  });

  const active = await prisma.conversation.findMany({
    where: { channel: "in_app", endedAt: null },
    select: { userId: true },
    distinct: ["userId"],
  });
  const activeIds = new Set(active.map((a) => a.userId));

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarUrl: true, platformRole: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // AVALIAÇÃO (usuário): votos por usuário.
  const votes = await prisma.messageFeedback.groupBy({
    by: ["userId", "rating"],
    where: { conversation: { channel: "in_app" } },
    _count: { _all: true },
  });
  const avalByUser = new Map<string, RatingCounts>();
  for (const v of votes) {
    const rc = avalByUser.get(v.userId) ?? zeroCounts();
    rc[v.rating as keyof RatingCounts] += v._count._all;
    avalByUser.set(v.userId, rc);
  }

  // PERÍCIA (plataforma): vereditos do juiz por usuário (status efetivo =
  // ajuste humano sobrescreve o automático), colapsados nos 4 baldes.
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: { conversation: { channel: "in_app" } },
    select: { status: true, humanStatus: true, conversation: { select: { userId: true } } },
  });
  const periciaByUser = new Map<string, RatingCounts>();
  for (const e of evals) {
    const uid = e.conversation?.userId;
    if (!uid) continue;
    const bucket = periciaBucket(e.humanStatus ?? e.status);
    if (!bucket) continue;
    const rc = periciaByUser.get(uid) ?? zeroCounts();
    rc[bucket] += 1;
    periciaByUser.set(uid, rc);
  }

  const rows = grouped.map((g) => {
    const u = userById.get(g.userId);
    const avaliacaoCounts = avalByUser.get(g.userId) ?? zeroCounts();
    const periciaCounts = periciaByUser.get(g.userId) ?? zeroCounts();
    return {
      userId: g.userId,
      name: u?.name ?? "",
      avatarUrl: u?.avatarUrl ?? null,
      role: u?.platformRole ?? "viewer",
      sessionCount: g._count._all,
      hasActiveSession: activeIds.has(g.userId),
      avaliacaoCounts,
      avaliacaoPct: computeAccuracy(avaliacaoCounts),
      periciaCounts,
      periciaPct: computeAccuracy(periciaCounts),
      lastActivity: g._max.updatedAt,
    };
  });

  rows.sort(
    (a, b) =>
      +new Date(b.lastActivity ?? 0) - +new Date(a.lastActivity ?? 0),
  );

  return rows.map(({ lastActivity: _lastActivity, ...rest }) => rest);
}

/**
 * Lista as sessões (conversas in_app) de um usuário, da mais recente para a
 * mais antiga, com índice cronológico (1 = primeira sessão do usuário),
 * contagem de mensagens, votos e acurácia.
 */
export async function listBubbleSessions(userId: string): Promise<SessionRow[]> {
  await requireMinRole("super_admin");

  const conversations = await prisma.conversation.findMany({
    where: { userId, channel: "in_app" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      endedAt: true,
    },
  });

  // Contagem de mensagens VISÍVEIS (igual ao filtro da coluna Conversa): exclui
  // role "tool" e as mensagens assistant intermediárias de tool-call (conteúdo
  // vazio). Sem isso o "_count" cru contava turnos com tool como 3 onde o
  // usuário vê 2. Uma query só pro usuário inteiro, agregada em memória.
  const msgRows = await prisma.message.findMany({
    where: { conversation: { userId, channel: "in_app" } },
    select: { conversationId: true, role: true, content: true, kind: true },
  });
  const visibleCountByConv = new Map<string, number>();
  for (const m of msgRows) {
    const visible =
      m.role !== "tool" && (m.content.trim().length > 0 || m.kind === "audio");
    if (!visible) continue;
    visibleCountByConv.set(
      m.conversationId,
      (visibleCountByConv.get(m.conversationId) ?? 0) + 1,
    );
  }

  // AVALIAÇÃO (usuário): votos por conversa.
  const votes = await prisma.messageFeedback.groupBy({
    by: ["conversationId", "rating"],
    where: { conversation: { userId, channel: "in_app" } },
    _count: { _all: true },
  });
  const avalByConv = new Map<string, RatingCounts>();
  for (const v of votes) {
    const rc = avalByConv.get(v.conversationId) ?? zeroCounts();
    rc[v.rating as keyof RatingCounts] += v._count._all;
    avalByConv.set(v.conversationId, rc);
  }

  // PERÍCIA (plataforma): vereditos do juiz por conversa (status efetivo).
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: { conversation: { userId, channel: "in_app" } },
    select: { status: true, humanStatus: true, conversationId: true },
  });
  const periciaByConv = new Map<string, RatingCounts>();
  for (const e of evals) {
    const bucket = periciaBucket(e.humanStatus ?? e.status);
    if (!bucket) continue;
    const rc = periciaByConv.get(e.conversationId) ?? zeroCounts();
    rc[bucket] += 1;
    periciaByConv.set(e.conversationId, rc);
  }

  const total = conversations.length;

  return conversations.map((c, pos) => {
    const avaliacaoCounts = avalByConv.get(c.id) ?? zeroCounts();
    const periciaCounts = periciaByConv.get(c.id) ?? zeroCounts();
    // Só a conversa MAIS RECENTE sem encerramento conta como "ativa" (a sessão
    // viva). As demais sem endedAt são sessões passadas nunca arquivadas.
    const isActive = pos === 0 && c.endedAt === null;
    // Fim exibido: usa o endedAt real; se faltar (sessão antiga nunca arquivada
    // e não-ativa), deriva pelo INÍCIO da sessão POSTERIOR (mais recente, em
    // pos-1) menos 15s. A ativa fica sem fim ("até agora").
    let endedAt = c.endedAt ? c.endedAt.toISOString() : null;
    if (!isActive && endedAt === null) {
      const posterior = conversations[pos - 1];
      if (posterior) {
        endedAt = new Date(+posterior.createdAt - 15_000).toISOString();
      }
    }
    return {
      conversationId: c.id,
      index: total - pos,
      startedAt: c.createdAt.toISOString(),
      endedAt,
      messageCount: visibleCountByConv.get(c.id) ?? 0,
      avaliacaoCounts,
      avaliacaoPct: computeAccuracy(avaliacaoCounts),
      periciaCounts,
      periciaPct: computeAccuracy(periciaCounts),
      isActive,
    };
  });
}

/**
 * Mensagem de uma sessão da bubble vista pelo super_admin no monitoramento.
 * Extende o DTO compartilhado com metadados de leitura (kind), sugestões
 * oferecidas, qual sugestão foi clicada e o veredito do juiz.
 */
export type BubbleSessionMessageDto = ConversationMessageDto & {
  kind: string;
  suggestions?: string[];
  clickedSuggestion?: string;
  evaluation?: { id: string; status: string } | null;
  /** Duração do turno em ms (wall-clock), anexada na assistant final. */
  durationMs?: number;
};

/**
 * Reconstroi os rótulos da trilha "Raciocinio" a partir do toolCalls
 * persistido. Réplica fiel de stepsFromToolCalls de conversation-messages
 * (não exportado lá). Defensivo contra formatos legados/null.
 */
function stepsFromToolCalls(toolCalls: unknown): { label: string }[] {
  if (!Array.isArray(toolCalls)) return [];
  const out: { label: string }[] = [];
  for (const item of toolCalls) {
    const name =
      item && typeof item === "object"
        ? (item as { name?: unknown }).name
        : undefined;
    if (typeof name === "string" && name.length > 0) {
      out.push({ label: progressLabel(name) });
    }
  }
  return out;
}

/**
 * Lê o histórico completo de uma conversa da bubble para o super_admin
 * monitorar. Diferente de getConversationMessages (que trava por dono e
 * filtra arquivadas), aqui o super_admin lê QUALQUER conversa, inclusive
 * arquivadas (sem filtro endedAt). Leitura exclusiva do cache interno.
 *
 * Agrega os steps por turno replicando o range-merge de getEvaluationDetail:
 * os toolCalls vivem nas mensagens assistant intermediárias; aqui anexamos
 * a trilha agregada na mensagem assistant FINAL de cada turno.
 */
export async function getBubbleSessionMessages(
  conversationId: string,
): Promise<
  | { ok: true; messages: BubbleSessionMessageDto[] }
  | { ok: false; error: string }
> {
  await requireMinRole("super_admin");

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conv) {
    return { ok: false, error: "Conversa não encontrada" };
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      role: true,
      content: true,
      kind: true,
      toolCalls: true,
      createdAt: true,
    },
  });

  // STEPS + DURAÇÃO por turno (range-merge igual ao getEvaluationDetail):
  // a trilha de cada turno é a soma dos toolCalls das mensagens assistant entre
  // o último user e a assistant final. A trilha (e a duração) são anexadas só
  // na assistant final. Duração = wall-clock do turno = createdAt(assistant
  // final) − createdAt(user que abriu o turno). É o proxy fiel do "X.Xs" da
  // bubble viva (que mede doneAt−startedAt); o valor exato por iteração vive em
  // LlmUsage.durationMs (ver RADAR: KPI de tempo médio no Backtest).
  const stepsByMsgId = new Map<string, { label: string }[]>();
  const durationByMsgId = new Map<string, number>();
  let accCalls: unknown[] = [];
  let lastAssistantId: string | null = null;
  let lastAssistantAt: Date | null = null;
  let turnStartAt: Date | null = null;
  const closeTurn = () => {
    if (lastAssistantId && accCalls.length > 0) {
      stepsByMsgId.set(lastAssistantId, stepsFromToolCalls(accCalls));
    }
    if (lastAssistantId && turnStartAt && lastAssistantAt) {
      const ms = +lastAssistantAt - +turnStartAt;
      if (ms > 0) durationByMsgId.set(lastAssistantId, ms);
    }
  };
  for (const m of messages) {
    if (m.role === "user") {
      closeTurn();
      accCalls = [];
      lastAssistantId = null;
      lastAssistantAt = null;
      turnStartAt = m.createdAt; // este user abre o próximo turno
    } else if (m.role === "assistant") {
      if (Array.isArray(m.toolCalls)) accCalls.push(...(m.toolCalls as unknown[]));
      else if (m.toolCalls != null) accCalls.push(m.toolCalls);
      lastAssistantId = m.id;
      lastAssistantAt = m.createdAt;
    }
  }
  closeTurn(); // fecha o último turno em aberto

  // JUIZ + SUGESTÕES por mensagem assistant.
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: { conversationId, assistantMessageId: { not: null } },
    select: {
      id: true,
      assistantMessageId: true,
      status: true,
      humanStatus: true,
      suggestions: true,
    },
  });
  const evalByMsg = new Map<
    string,
    { id: string; statusEfetivo: string; suggestions: string[] }
  >();
  for (const e of evals) {
    if (!e.assistantMessageId) continue;
    evalByMsg.set(e.assistantMessageId, {
      id: e.id,
      statusEfetivo: e.humanStatus ?? e.status,
      suggestions: Array.isArray(e.suggestions) ? e.suggestions : [],
    });
  }

  // FEEDBACK do dono (todos os votos da conversa são do dono).
  const feedbacks = await prisma.messageFeedback.findMany({
    where: { conversationId },
    select: { assistantMessageId: true, rating: true, comment: true },
  });
  const fbByMsg = new Map(
    feedbacks.map((f) => [
      f.assistantMessageId,
      { rating: f.rating, comment: f.comment },
    ]),
  );

  // Monta o DTO base por mensagem.
  const out: BubbleSessionMessageDto[] = messages.map((m) => {
    const steps = stepsByMsgId.get(m.id) ?? [];
    const durationMs = durationByMsgId.get(m.id);
    const ev = evalByMsg.get(m.id) ?? null;
    const fb = fbByMsg.get(m.id) ?? null;
    // Mostra o snapshot EXATO que a bubble persistiu (POST suggestions-shown):
    // o conjunto que o usuário de fato viu. Nada é fabricado aqui , se a
    // mensagem for antiga (anterior ao snapshot) e só tiver as chips cruas,
    // mostramos essas e nada além. Honestidade > completar com invenção.
    return {
      id: m.id,
      role: m.role as ConversationMessageDto["role"],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      kind: m.kind,
      ...(typeof durationMs === "number" ? { durationMs } : {}),
      ...(steps.length > 0 ? { steps } : {}),
      ...(ev && ev.suggestions.length > 0 ? { suggestions: ev.suggestions } : {}),
      evaluation: ev ? { id: ev.id, status: ev.statusEfetivo } : null,
      ...(fb ? { feedback: fb } : {}),
    };
  });

  // CLICADA DERIVADA: para cada assistant com sugestões, olha a PRÓXIMA
  // mensagem user; se o conteúdo dela casar (trim) com alguma sugestão,
  // marca a PRIMEIRA sugestão igual como clickedSuggestion.
  for (let i = 0; i < out.length; i++) {
    const msg = out[i];
    if (msg.role !== "assistant" || !msg.suggestions) continue;
    let nextUser: BubbleSessionMessageDto | null = null;
    for (let j = i + 1; j < out.length; j++) {
      if (out[j].role === "user") {
        nextUser = out[j];
        break;
      }
    }
    if (!nextUser) continue;
    const clicked = nextUser.content.trim();
    const match = msg.suggestions.find((s) => s.trim() === clicked);
    if (match !== undefined) {
      msg.clickedSuggestion = match;
    }
  }

  return { ok: true, messages: out };
}
