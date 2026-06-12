/**
 * Persistência e agrupamento de conversas do agente nexus-odoo.
 *
 * Regras de agrupamento (SPEC §9.1):
 * - WhatsApp: reutiliza conversa com última msg < 24h; senão cria nova.
 * - In-app / playground: cada sessão de UI cria uma conversa nova (via createConversation).
 *
 * Usa Prisma v7 + models Conversation e Message da F5 (Task 1.1).
 */

import { prisma } from "@/lib/prisma";
import type { AgentChannel, MessageRole } from "@/generated/prisma/client";
import type { ToolCall, ReasoningContext } from "./llm/types";

/** 24 horas em ms , janela de reutilização de conversa WhatsApp. */
const WHATSAPP_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Quantidade padrão de mensagens carregadas no histórico. */
const DEFAULT_HISTORY_BUDGET = 20;

export interface ConversationRecord {
  id: string;
  userId: string;
  channel: AgentChannel;
  updatedAt: Date;
}

export interface HistoryMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCall[] | null;
}

/**
 * Deriva um título curto (≤60 chars) da primeira mensagem do usuário.
 * Usado para preencher Conversation.title ao criar.
 */
export function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim();
  if (!trimmed) return "Nova conversa";
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 60)}...`;
}

/**
 * Remove do histórico mensagens que formariam pares tool_use/tool_result incompletos.
 *
 * A API Anthropic exige que toda mensagem assistant com toolCalls tenha a correspondente
 * mensagem tool logo após. Se o budget de histórico cortar no meio de um par,
 * a API retorna 400. Esta função remove pares incompletos da borda do histórico.
 */
export function sanitizeHistoryPairs(history: HistoryMessage[]): HistoryMessage[] {
  if (history.length === 0) return history;

  // Percorre do início: remove um assistant-with-toolCalls sem tool_result subsequente
  // e remove um tool sem assistant-with-toolCalls precedente.
  const result: HistoryMessage[] = [];
  let i = 0;
  while (i < history.length) {
    const msg = history[i];
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      // Verifica se a próxima mensagem é tool (par completo)
      if (i + 1 < history.length && history[i + 1].role === "tool") {
        result.push(msg);
        result.push(history[i + 1]);
        i += 2;
      } else {
        // Par incompleto , descarta o assistant com toolCalls
        i++;
      }
    } else if (msg.role === "tool") {
      // tool sem assistant precedente no result , descarta
      // (pode acontecer quando o assistant foi descartado acima)
      const lastInResult = result[result.length - 1];
      if (lastInResult?.role === "assistant" && lastInResult.toolCalls?.length) {
        result.push(msg);
      }
      i++;
    } else {
      result.push(msg);
      i++;
    }
  }
  return result;
}

/**
 * Retorna a conversa WhatsApp ativa (última msg < 24h) ou cria uma nova.
 * Semântica de canal: uma conversa por janela de 24h para WhatsApp.
 */
export async function getOrCreateWhatsappConversation(
  userId: string,
): Promise<ConversationRecord> {
  const cutoff = new Date(Date.now() - WHATSAPP_REUSE_WINDOW_MS);

  const existing = await prisma.conversation.findFirst({
    where: {
      userId,
      channel: "whatsapp",
      // Conversa arquivada ("Limpar sessao") nao e reaproveitada na janela.
      endedAt: null,
      updatedAt: { gte: cutoff },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing as ConversationRecord;
  }

  return createConversation(userId, "whatsapp");
}

/**
 * Cria uma nova conversa para o usuário no canal especificado.
 */
export async function createConversation(
  userId: string,
  channel: AgentChannel,
): Promise<ConversationRecord> {
  const conv = await prisma.conversation.create({
    data: {
      userId,
      channel,
    },
  });
  return conv as ConversationRecord;
}

/**
 * Garante que a conversa pertence ao usuário.
 * Lança erro se não existir ou pertencer a outro usuário.
 */
export async function assertConversationOwned(
  conversationId: string,
  userId: string,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, endedAt: true },
  });

  if (!conv) {
    throw new Error(`Conversa não encontrada: ${conversationId}`);
  }

  if (conv.userId !== userId) {
    throw new Error(
      `Acesso negado: conversa ${conversationId} não pertence ao usuário ${userId}`,
    );
  }

  // Conversa arquivada ("Limpar sessao") e terminal: nao aceita novos turnos.
  // Bloqueia tanto a rota de stream quanto o run-agent de reabrir uma sessao
  // que o usuario ja limpou (ex.: aba orfa com o id antigo em memoria).
  if (conv.endedAt) {
    throw new Error(`Conversa encerrada: ${conversationId}`);
  }
}

/**
 * Carrega o histórico de mensagens de uma conversa.
 *
 * @param conversationId  ID da conversa.
 * @param budget          Número máximo de mensagens a retornar (default 20).
 *                        Passe 0 para retornar array vazio sem tocar o banco.
 */
export async function loadHistory(
  conversationId: string,
  budget: number = DEFAULT_HISTORY_BUDGET,
  opts?: { includeSystem?: boolean },
): Promise<HistoryMessage[]> {
  if (budget <= 0) return [];

  // Busca as últimas N mensagens em ordem decrescente e inverte para cronológico
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: budget,
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
    },
  });

  // Inverter para ordem cronológica (mais antigas primeiro)
  messages.reverse();

  // R2-ctx: modo "Usuário + IA" (includeSystem=false). Remove mensagens de
  // ferramenta e tira as toolCalls das mensagens do assistant (descartando as
  // que eram só chamada de tool, sem texto), pra não deixar referências de
  // tool órfãs que quebrariam a API. O default (true) preserva tudo como antes.
  if (opts?.includeSystem === false) {
    return messages
      .filter((m) => m.role !== "tool")
      .filter(
        (m) =>
          m.role !== "assistant" || (m.content != null && m.content.trim().length > 0),
      )
      .map((m) => ({
        id: m.id,
        role: m.role as MessageRole,
        content: m.content,
        toolCalls: null,
      }));
  }

  return messages.map((m) => ({
    id: m.id,
    role: m.role as MessageRole,
    content: m.content,
    toolCalls: m.toolCalls
      ? (m.toolCalls as unknown as ToolCall[])
      : null,
  }));
}

/**
 * Persiste uma mensagem na conversa.
 *
 * @param conversationId  ID da conversa.
 * @param role            Papel da mensagem (user | assistant | tool).
 * @param content         Texto da mensagem.
 * @param toolCalls       Tool calls da mensagem assistant (opcional).
 * @param kind            Tipo da entrada (ex.: "audio" quando veio de voz).
 */
export async function persistMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  toolCalls?: ToolCall[],
  kind?: string,
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      ...(kind ? { kind } : {}),
    },
  });

  // Mensagem assistant com tool calls altera o ranking de uso do usuario,
  // invalida o cache das sugestoes personalizadas para refletir o uso recente
  // ja na proxima abertura da bubble. Fire-and-forget: erros (Redis off,
  // findUnique nao mockado em teste, etc.) nao bloqueiam nem demoram o save.
  if (role === "assistant" && toolCalls && toolCalls.length > 0) {
    void (async () => {
      try {
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { userId: true },
        });
        if (conv?.userId) {
          const { invalidatePersonalizedWelcomeCache } = await import(
            "@/lib/agent/personalized-suggestions"
          );
          await invalidatePersonalizedWelcomeCache(conv.userId);
        }
      } catch {
        // best-effort; cache cai por TTL se a invalidacao falhar
      }
    })();
  }
}

// ============================================================================
// Tool results persistence + last-N-pairs (Onda 1 da Inteligencia).
// ============================================================================

/**
 * Variante de `persistMessage` que retorna o ID da Message criada.
 *
 * Usado pelo sistema /agente/qualidade (Onda 3a): trigger fire-and-forget
 * em run-agent.ts precisa do `assistantMessageId` pra linkar a avaliacao
 * PENDENTE criada em ConversationQualityEvaluation.
 *
 * Versao generica (qualquer role). Para o caso especifico de assistant
 * com toolCalls, use `persistAssistantMessageWithTools` (otimizada com
 * persistencia de toolCalls + invalidacao de cache).
 */
export async function persistMessageAndReturnId(
  conversationId: string,
  role: MessageRole,
  content: string,
): Promise<string> {
  const created = await prisma.message.create({
    data: { conversationId, role, content },
    select: { id: true },
  });
  return created.id;
}

/**
 * Persiste uma mensagem assistant que disparou tool calls e retorna o id da
 * Message criada. Variante de `persistMessage` usada quando o caller precisa
 * fazer um UPDATE posterior (ex.: gravar `toolResults` apos a execucao das
 * tools).
 *
 * Mantemos `persistMessage` (`Promise<void>`) para nao quebrar mocks de
 * testes existentes , esta variante e opt-in.
 */
export async function persistAssistantMessageWithTools(
  conversationId: string,
  content: string,
  toolCalls: ToolCall[],
): Promise<string> {
  const msg = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      toolCalls: JSON.parse(JSON.stringify(toolCalls)),
    },
    select: { id: true },
  });

  // Invalidacao do cache de welcome (igual a persistMessage).
  void (async () => {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { userId: true },
      });
      if (conv?.userId) {
        const { invalidatePersonalizedWelcomeCache } = await import(
          "@/lib/agent/personalized-suggestions"
        );
        await invalidatePersonalizedWelcomeCache(conv.userId);
      }
    } catch {
      // best-effort
    }
  })();

  return msg.id;
}

/**
 * Atualiza `Message.toolResults` (`Json?`) com o mapa `{ [callId]: result }`.
 * Idempotente: nao falha se a mensagem nao existir mais (cascade delete).
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.2
 */
export async function updateMessageToolResults(
  messageId: string,
  results: Record<string, string>,
  toolCalls?: ToolCall[],
): Promise<void> {
  try {
    // Onda M (Arquitetura 3.0) T1.3: deriva e grava o digest junto com os
    // resultados , e o que sobrevive no replay quando o payload bruto sai do
    // contexto. Deterministico e barato; falha de digest nunca bloqueia o turno.
    let toolDigest: string | null = null;
    if (toolCalls?.length) {
      try {
        const { derivarToolDigest } = await import("./memoria/tool-digest");
        toolDigest = derivarToolDigest(toolCalls, results);
      } catch {
        toolDigest = null;
      }
    }
    await prisma.message.update({
      where: { id: messageId },
      data: { toolResults: results, ...(toolDigest ? { toolDigest } : {}) },
    });
  } catch (err) {
    // Best-effort: a mensagem pode ter sido deletada (cascade da conversation).
    // Falhas aqui nao bloqueiam o turno; logamos para diagnostico.
    console.warn(
      "[updateMessageToolResults] falha ao gravar tool_results em message=" +
        messageId,
      err,
    );
  }
}

// ----------------------------------------------------------------------------
// getLastNPairs , usado pela Frente C (sugestoes contextuais) na Onda 4.
// ----------------------------------------------------------------------------

/**
 * Um "par" da conversa: a mensagem do usuario seguida da resposta final do
 * assistant. Mensagens intermediarias (role="tool" ou assistant com
 * toolCalls nao-vazio) sao ignoradas , entram no contexto interno do agente,
 * nao no contexto narrativo da conversa.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §5.5
 */
export interface ConversationPair {
  user: { id: string; content: string; createdAt: Date };
  assistant: { id: string; content: string; createdAt: Date };
}

function isFinalAssistant(m: {
  role: string;
  toolCalls: unknown;
}): boolean {
  if (m.role !== "assistant") return false;
  // Final = sem toolCalls OU toolCalls vazio (array vazio).
  const tc = m.toolCalls;
  if (tc == null) return true;
  if (Array.isArray(tc) && tc.length === 0) return true;
  return false;
}

/**
 * Retorna os ultimos N pares `user -> finalAssistant` da conversa, em ordem
 * cronologica DESC (mais recente primeiro).
 *
 * Algoritmo: itera mensagens em ordem cronologica DESC; para cada
 * `finalAssistant` encontrado, busca a primeira mensagem `user` anterior;
 * forma um par e segue. Para na contagem `n` ou quando esgota mensagens.
 *
 * @param conversationId  ID da conversa.
 * @param n               Quantos pares retornar. Default 5.
 */
export async function getLastNPairs(
  conversationId: string,
  n: number = 5,
): Promise<ConversationPair[]> {
  // Busca mensagens em ordem cronologica DESC. Cap defensivo de 200 mensagens
  // (cobre n=5 com folga ate em conversas com muitas tool calls intermediarias).
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, role: true, content: true, toolCalls: true, createdAt: true },
  });

  const pairs: ConversationPair[] = [];
  let assistantBuffer: { id: string; content: string; createdAt: Date } | null = null;

  for (const m of messages) {
    if (pairs.length >= n) break;

    if (assistantBuffer == null) {
      // Aguardando um final assistant.
      if (isFinalAssistant(m)) {
        assistantBuffer = { id: m.id, content: m.content, createdAt: m.createdAt };
      }
      continue;
    }

    // Ja temos assistant, procurando o user que o originou.
    if (m.role === "user") {
      pairs.push({
        user: { id: m.id, content: m.content, createdAt: m.createdAt },
        assistant: assistantBuffer,
      });
      assistantBuffer = null;
    }
    // role "tool" ou assistant intermediario (com toolCalls) sao ignorados ,
    // sao contexto interno entre o user e a resposta final.
  }

  return pairs;
}

// ============================================================================
// Reasoning history persistence (Onda 1 da modernizacao dos adapters).
// ============================================================================

/** Cap maximo de iteracoes preservadas. */
export const REASONING_HISTORY_MAX_ITEMS = 20;
/** Cap maximo em bytes serializados. */
export const REASONING_HISTORY_MAX_BYTES = 50_000;

/**
 * Carrega o historico opaco de raciocinio acumulado em uma conversa.
 * Retorna array vazio se a conversa nao existe ou nao tem historico.
 */
export async function loadConversationReasoningHistory(
  conversationId: string,
): Promise<ReasoningContext[]> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { reasoningHistory: true },
  });
  if (!conv) return [];
  const raw = conv.reasoningHistory as unknown;
  return Array.isArray(raw) ? (raw as ReasoningContext[]) : [];
}

/**
 * Trunca o historico para caber em REASONING_HISTORY_MAX_ITEMS e
 * REASONING_HISTORY_MAX_BYTES (o que vier primeiro), mantendo as
 * iteracoes mais recentes.
 */
export function capReasoningHistory(
  history: ReasoningContext[],
  maxItems = REASONING_HISTORY_MAX_ITEMS,
  maxBytes = REASONING_HISTORY_MAX_BYTES,
): ReasoningContext[] {
  let trimmed = history.length > maxItems ? history.slice(-maxItems) : history;
  // Truncamento por bytes: vai removendo do inicio ate caber.
  while (trimmed.length > 0) {
    const size = JSON.stringify(trimmed).length;
    if (size <= maxBytes) break;
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

/**
 * Persiste o historico de raciocinio na conversa. Aplica cap antes de gravar.
 */
export async function saveConversationReasoningHistory(
  conversationId: string,
  history: ReasoningContext[],
): Promise<void> {
  const capped = capReasoningHistory(history);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { reasoningHistory: capped as unknown as object },
  });
}
