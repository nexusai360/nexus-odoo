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

export type RatingCounts = {
  CORRETO: number;
  PARCIAL: number;
  ERRADO: number;
  ALUCINOU: number;
};

export type Collaborator = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  sessionCount: number;
  hasActiveSession: boolean;
  ratingCounts: RatingCounts;
  accuracyPct: number | null;
};

export type SessionRow = {
  conversationId: string;
  index: number;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  ratingCounts: RatingCounts;
  accuracyPct: number | null;
  isActive: boolean;
};

function zeroCounts(): RatingCounts {
  return { CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 };
}

/**
 * Acurácia ponderada: acertos valem 1, parciais valem 0.5; erros e alucinações
 * valem 0. Sem votos, retorna null (não há base para calcular).
 */
export function computeAccuracy(rc: RatingCounts): number | null {
  const total = rc.CORRETO + rc.PARCIAL + rc.ERRADO + rc.ALUCINOU;
  if (total === 0) return null;
  return Math.round((100 * (rc.CORRETO + 0.5 * rc.PARCIAL)) / total);
}

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
    select: { id: true, name: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const votes = await prisma.messageFeedback.groupBy({
    by: ["userId", "rating"],
    where: { conversation: { channel: "in_app" } },
    _count: { _all: true },
  });
  const countsByUser = new Map<string, RatingCounts>();
  for (const v of votes) {
    const rc = countsByUser.get(v.userId) ?? zeroCounts();
    rc[v.rating as keyof RatingCounts] += v._count._all;
    countsByUser.set(v.userId, rc);
  }

  const rows = grouped.map((g) => {
    const u = userById.get(g.userId);
    const ratingCounts = countsByUser.get(g.userId) ?? zeroCounts();
    return {
      userId: g.userId,
      name: u?.name ?? "",
      avatarUrl: u?.avatarUrl ?? null,
      sessionCount: g._count._all,
      hasActiveSession: activeIds.has(g.userId),
      ratingCounts,
      accuracyPct: computeAccuracy(ratingCounts),
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
      _count: { select: { messages: true } },
    },
  });

  const votes = await prisma.messageFeedback.groupBy({
    by: ["conversationId", "rating"],
    where: { conversation: { userId, channel: "in_app" } },
    _count: { _all: true },
  });
  const countsByConv = new Map<string, RatingCounts>();
  for (const v of votes) {
    const rc = countsByConv.get(v.conversationId) ?? zeroCounts();
    rc[v.rating as keyof RatingCounts] += v._count._all;
    countsByConv.set(v.conversationId, rc);
  }

  const total = conversations.length;

  return conversations.map((c, pos) => {
    const ratingCounts = countsByConv.get(c.id) ?? zeroCounts();
    return {
      conversationId: c.id,
      index: total - pos,
      startedAt: c.createdAt.toISOString(),
      endedAt: c.endedAt ? c.endedAt.toISOString() : null,
      messageCount: c._count.messages,
      ratingCounts,
      accuracyPct: computeAccuracy(ratingCounts),
      isActive: c.endedAt === null,
    };
  });
}
