// src/lib/reports/builder/builder-conversation-repo.ts
// F6 (chat = Nex) , persistencia da conversa do Construtor. Tabelas isoladas das
// do Nex (builder_conversations / builder_messages). Uma conversa constroi UMA
// ficha (savedReportId), reusada entre turnos.
import { prisma } from "@/lib/prisma";

export type BuilderRole = "user" | "assistant";

/** Passo da trilha "Raciocinio" persistido (rotulo verbatim da tool). */
export interface BuilderStep {
  label: string;
}

export interface BuilderMessageDto {
  id: string;
  role: BuilderRole;
  content: string;
  kind: string;
  createdAt: string;
  /** Rotulos das tools consultadas neste turno (rebuild da trilha). */
  steps?: BuilderStep[];
  /** Duracao do turno em ms (resumo "Raciocinio . N tools . Xs"). */
  durationMs?: number;
}

/** Cria uma conversa nova do construtor para o usuario. */
export async function criarBuilderConversa(userId: string): Promise<{ id: string }> {
  const conv = await prisma.builderConversation.create({
    data: { userId },
    select: { id: true },
  });
  return conv;
}

/** Garante que a conversa pertence ao usuario e nao foi arquivada. Lanca erro. */
export async function assertBuilderConversaOwned(
  conversationId: string,
  userId: string,
): Promise<void> {
  const conv = await prisma.builderConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, endedAt: true },
  });
  if (!conv) throw new Error(`Conversa do construtor nao encontrada: ${conversationId}`);
  if (conv.userId !== userId) throw new Error(`Acesso negado a conversa ${conversationId}`);
  if (conv.endedAt) throw new Error(`Conversa do construtor encerrada: ${conversationId}`);
}

/** Persiste uma mensagem e devolve o id criado. */
export async function persistBuilderMensagem(
  conversationId: string,
  role: BuilderRole,
  content: string,
  opts?: { steps?: BuilderStep[]; durationMs?: number; kind?: string },
): Promise<string> {
  const msg = await prisma.builderMessage.create({
    data: {
      conversationId,
      role,
      content,
      steps: opts?.steps && opts.steps.length > 0 ? (opts.steps as object) : undefined,
      durationMs: opts?.durationMs ?? undefined,
      kind: opts?.kind ?? "text",
    },
    select: { id: true },
  });
  // Toca o updatedAt da conversa (ranking da conversa ativa por recencia).
  await prisma.builderConversation
    .update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
    .catch(() => {});
  return msg.id;
}

/** Vincula (1a vez) ou mantem o SavedReport que esta conversa constroi. */
export async function setBuilderSavedReport(
  conversationId: string,
  savedReportId: string,
): Promise<void> {
  await prisma.builderConversation.update({
    where: { id: conversationId },
    data: { savedReportId },
  });
}

/** Carrega as mensagens da conversa (cronologico asc), so se nao arquivada. */
export async function carregarBuilderMensagens(
  conversationId: string,
): Promise<BuilderMessageDto[]> {
  const rows = await prisma.builderMessage.findMany({
    where: { conversationId, conversation: { endedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      kind: true,
      createdAt: true,
      steps: true,
      durationMs: true,
    },
  });
  return rows.map((m) => {
    const steps = Array.isArray(m.steps)
      ? (m.steps as unknown[])
          .map((s) =>
            s && typeof s === "object" && typeof (s as { label?: unknown }).label === "string"
              ? { label: (s as { label: string }).label }
              : null,
          )
          .filter((s): s is BuilderStep => s !== null)
      : [];
    return {
      id: m.id,
      role: m.role as BuilderRole,
      content: m.content,
      kind: m.kind,
      createdAt: m.createdAt.toISOString(),
      ...(steps.length > 0 ? { steps } : {}),
      ...(typeof m.durationMs === "number" ? { durationMs: m.durationMs } : {}),
    };
  });
}

/** Arquiva ("Limpar conversa"): seta endedAt. Devolve false se nao for do dono. */
export async function arquivarBuilderConversa(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const conv = await prisma.builderConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!conv || conv.userId !== userId) return false;
  await prisma.builderConversation.update({
    where: { id: conversationId },
    data: { endedAt: new Date() },
  });
  return true;
}

/** Conversa ativa mais recente do usuario (para restaurar ao abrir o construtor). */
export async function obterBuilderConversaAtiva(
  userId: string,
): Promise<{ id: string; savedReportId: string | null } | null> {
  const conv = await prisma.builderConversation.findFirst({
    where: { userId, endedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, savedReportId: true },
  });
  return conv;
}
