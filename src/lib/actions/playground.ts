"use server";

/**
 * Server Actions para sessões de playground do Agente Nex.
 *
 * Sessões são persistentes em Postgres (PlaygroundSession / PlaygroundMessage).
 * Cada sessão tem provedor/modelo próprios e um snapshot de prompt editável,
 * independente da configuração de produção.
 *
 * Bloco 6 — F5 UI rework v2.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentSettings } from "@/lib/actions/agent-config";
import { PROVIDER_META, listModels } from "@/lib/agent/llm/catalog";
import type { LlmProvider } from "@/lib/agent/llm/types";
import type { ActionResult } from "@/lib/actions/users";
import type {
  PlaygroundPromptSnapshot,
  PlaygroundSessionSummary,
  PlaygroundSessionDetail,
  PlaygroundMessageData,
} from "@/lib/actions/playground-types";

// ---------------------------------------------------------------------------
// Guard RBAC — playground é super_admin/admin (SPEC §8.3)
// ---------------------------------------------------------------------------

async function requirePlaygroundAccess(): Promise<{ userId: string }> {
  const me = await getCurrentUser();
  if (!me || (me.platformRole !== "super_admin" && me.platformRole !== "admin")) {
    redirect("/dashboard");
  }
  return { userId: me.id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSnapshot(json: unknown): PlaygroundPromptSnapshot {
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

/** Snapshot do prompt de produção — base de uma nova sessão. */
async function productionPromptSnapshot(): Promise<PlaygroundPromptSnapshot> {
  const res = await getAgentSettings();
  if (!res.success || !res.data) {
    return { identityBase: null, personality: "", tone: "", guardrails: [] };
  }
  return {
    identityBase: res.data.identityBase,
    personality: res.data.personality,
    tone: res.data.tone,
    guardrails: res.data.guardrails,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Lista os provedores que têm ao menos uma chave de API cadastrada, com os
 * modelos do catálogo de cada um. Alimenta os selects da sessão de playground.
 */
export async function listAvailablePlaygroundProviders(): Promise<
  ActionResult<
    {
      provider: LlmProvider;
      label: string;
      models: { id: string; label: string; tier: string; description: string }[];
    }[]
  >
> {
  try {
    await requirePlaygroundAccess();
    const credentialed = await prisma.llmCredential.findMany({
      distinct: ["provider"],
      select: { provider: true },
    });
    const providers = credentialed
      .map((c) => c.provider as LlmProvider)
      .filter((p): p is LlmProvider => p in PROVIDER_META);

    const { modelDescription } = await import("@/lib/agent/llm/catalog");
    return {
      success: true,
      data: providers.map((p) => ({
        provider: p,
        label: PROVIDER_META[p].label,
        models: listModels(p).map((m) => ({
          id: m.id,
          label: m.label,
          tier: m.tier,
          description: modelDescription(m),
        })),
      })),
    };
  } catch (err) {
    console.error("[listAvailablePlaygroundProviders]", err);
    return { success: false, error: "Erro ao listar provedores" };
  }
}

/** Lista as sessões de playground do usuário (mais recentes primeiro). */
export async function listPlaygroundSessions(): Promise<
  ActionResult<PlaygroundSessionSummary[]>
> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const rows = await prisma.playgroundSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        provider: r.provider,
        model: r.model,
        costUsd: Number(r.costUsd),
        costBrl: Number(r.costBrl),
        messageCount: r._count.messages,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
      })),
    };
  } catch (err) {
    console.error("[listPlaygroundSessions]", err);
    return { success: false, error: "Erro ao listar sessões" };
  }
}

/** Cria uma nova sessão — prompt inicia como cópia da produção. */
export async function createPlaygroundSession(input: {
  provider: string;
  model: string;
}): Promise<ActionResult<PlaygroundSessionDetail>> {
  try {
    const { userId } = await requirePlaygroundAccess();
    if (!input.provider || !input.model) {
      return { success: false, error: "Provedor e modelo são obrigatórios" };
    }
    const snapshot = await productionPromptSnapshot();
    const row = await prisma.playgroundSession.create({
      data: {
        userId,
        provider: input.provider,
        model: input.model,
        promptSnapshot: snapshot as unknown as object,
      },
    });
    return {
      success: true,
      data: {
        id: row.id,
        title: row.title,
        provider: row.provider,
        model: row.model,
        promptSnapshot: snapshot,
        costUsd: 0,
        costBrl: 0,
        archivedAt: null,
        messages: [],
      },
    };
  } catch (err) {
    console.error("[createPlaygroundSession]", err);
    return { success: false, error: "Erro ao criar sessão" };
  }
}

/** Carrega uma sessão completa com mensagens. */
export async function getPlaygroundSession(
  sessionId: string,
): Promise<ActionResult<PlaygroundSessionDetail>> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const row = await prisma.playgroundSession.findFirst({
      where: { id: sessionId, userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return { success: false, error: "Sessão não encontrada" };
    return {
      success: true,
      data: {
        id: row.id,
        title: row.title,
        provider: row.provider,
        model: row.model,
        promptSnapshot: parseSnapshot(row.promptSnapshot),
        costUsd: Number(row.costUsd),
        costBrl: Number(row.costBrl),
        archivedAt: row.archivedAt?.toISOString() ?? null,
        messages: row.messages.map(
          (m): PlaygroundMessageData => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "tool",
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          }),
        ),
      },
    };
  } catch (err) {
    console.error("[getPlaygroundSession]", err);
    return { success: false, error: "Erro ao carregar sessão" };
  }
}

/** Arquiva uma sessão (mantém no histórico, fora da lista ativa). */
export async function archivePlaygroundSession(
  sessionId: string,
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const owned = await prisma.playgroundSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "Sessão não encontrada" };
    await prisma.playgroundSession.update({
      where: { id: sessionId },
      data: { archivedAt: new Date() },
    });
    return { success: true };
  } catch (err) {
    console.error("[archivePlaygroundSession]", err);
    return { success: false, error: "Erro ao arquivar sessão" };
  }
}

/** Exclui uma sessão e suas mensagens. */
export async function deletePlaygroundSession(
  sessionId: string,
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const owned = await prisma.playgroundSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "Sessão não encontrada" };
    await prisma.playgroundSession.delete({ where: { id: sessionId } });
    return { success: true };
  } catch (err) {
    console.error("[deletePlaygroundSession]", err);
    return { success: false, error: "Erro ao excluir sessão" };
  }
}

/** Atualiza provedor/modelo de uma sessão (sem afetar produção). */
export async function updatePlaygroundSessionModel(input: {
  sessionId: string;
  provider: string;
  model: string;
}): Promise<ActionResult> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const owned = await prisma.playgroundSession.findFirst({
      where: { id: input.sessionId, userId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "Sessão não encontrada" };
    await prisma.playgroundSession.update({
      where: { id: input.sessionId },
      data: { provider: input.provider, model: input.model },
    });
    return { success: true };
  } catch (err) {
    console.error("[updatePlaygroundSessionModel]", err);
    return { success: false, error: "Erro ao atualizar modelo" };
  }
}

/** Salva o snapshot de prompt editado de uma sessão (não afeta produção). */
export async function savePlaygroundSessionPrompt(input: {
  sessionId: string;
  prompt: PlaygroundPromptSnapshot;
}): Promise<ActionResult> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const owned = await prisma.playgroundSession.findFirst({
      where: { id: input.sessionId, userId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "Sessão não encontrada" };
    await prisma.playgroundSession.update({
      where: { id: input.sessionId },
      data: { promptSnapshot: input.prompt as unknown as object },
    });
    return { success: true };
  } catch (err) {
    console.error("[savePlaygroundSessionPrompt]", err);
    return { success: false, error: "Erro ao salvar prompt da sessão" };
  }
}

/**
 * Promove o prompt da sessão para produção (AgentSettings global).
 * Aplica identidade, personalidade, tom e guardrails.
 */
export async function applyPlaygroundPromptToProduction(
  sessionId: string,
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlaygroundAccess();
    const row = await prisma.playgroundSession.findFirst({
      where: { id: sessionId, userId },
      select: { promptSnapshot: true },
    });
    if (!row) return { success: false, error: "Sessão não encontrada" };
    const snap = parseSnapshot(row.promptSnapshot);
    await prisma.agentSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        identityBase: snap.identityBase,
        personality: snap.personality,
        tone: snap.tone,
        guardrails: snap.guardrails,
      },
      update: {
        identityBase: snap.identityBase,
        personality: snap.personality,
        tone: snap.tone,
        guardrails: snap.guardrails,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[applyPlaygroundPromptToProduction]", err);
    return { success: false, error: "Erro ao aplicar prompt à produção" };
  }
}
