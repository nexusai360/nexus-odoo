"use server";

// src/lib/actions/builder-conversation.ts
// F6 (chat = Nex) , server actions da conversa do Construtor: historico,
// arquivar ("Limpar conversa"), exportar .txt e conversa ativa (restaurar).
// Gate admin/super_admin + propriedade da conversa (mesmo do construirRelatorio).
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  carregarBuilderMensagens,
  arquivarBuilderConversa,
  obterBuilderConversaAtiva,
  type BuilderMessageDto,
} from "@/lib/reports/builder/builder-conversation-repo";
import {
  formatarBuilderConversaTxt,
  nomeArquivoBuilderConversa,
} from "@/lib/reports/builder/builder-conversa-export";

async function gateAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Nao autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado" };
  }
  return { ok: true, userId: me.id };
}

async function donoDaConversa(conversationId: string, userId: string): Promise<boolean> {
  const conv = await prisma.builderConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  return !!conv && conv.userId === userId;
}

export async function getBuilderConversationMessages(
  conversationId: string,
): Promise<{ ok: true; messages: BuilderMessageDto[] } | { ok: false; error: string }> {
  const gate = await gateAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!(await donoDaConversa(conversationId, gate.userId))) {
    return { ok: false, error: "Conversa nao encontrada" };
  }
  const messages = await carregarBuilderMensagens(conversationId);
  return { ok: true, messages };
}

export async function arquivarBuilderConversaAction(
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await gateAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const ok = await arquivarBuilderConversa(conversationId, gate.userId);
  return ok ? { ok: true } : { ok: false, error: "Nao foi possivel limpar a conversa." };
}

export async function exportarBuilderConversaTxt(
  conversationId: string,
): Promise<{ ok: true; content: string; filename: string } | { ok: false; error: string }> {
  const gate = await gateAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const conv = await prisma.builderConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, title: true, createdAt: true, savedReportId: true },
  });
  if (!conv || conv.userId !== gate.userId) {
    return { ok: false, error: "Conversa nao encontrada" };
  }
  const messages = await carregarBuilderMensagens(conversationId);
  if (messages.length === 0) {
    return { ok: false, error: "Nada para exportar ainda. Faca pelo menos uma pergunta." };
  }
  // Titulo: prioriza o do SavedReport vinculado (nome real do relatorio).
  let titulo = conv.title;
  if (conv.savedReportId) {
    const sr = await prisma.savedReport.findUnique({
      where: { id: conv.savedReportId },
      select: { titulo: true },
    });
    if (sr?.titulo) titulo = sr.titulo;
  }
  const meta = { titulo, criadoEm: conv.createdAt };
  return {
    ok: true,
    content: formatarBuilderConversaTxt(messages, meta),
    filename: nomeArquivoBuilderConversa(meta),
  };
}

export async function obterBuilderConversaAtivaAction(): Promise<
  { ok: true; conversation: { id: string; savedReportId: string | null } | null } | { ok: false; error: string }
> {
  const gate = await gateAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const conversation = await obterBuilderConversaAtiva(gate.userId);
  return { ok: true, conversation };
}
