/**
 * Orquestrador do agente nexus-odoo.
 *
 * Portado de nexus-insights/src/lib/llm/agent/run-nex.ts.
 * Adaptações principais:
 * - Tools vêm do MCP da F4 (createMcpSession) em vez de NEX_TOOLS estático.
 * - executeTool substituído por session.callTool (MCP).
 * - Resultado MCP normalizado para string e truncado (G6 , MAX_TOOL_RESULT_BYTES).
 * - PlatformRole do usuário carregado para injetar BI_SCHEMA_REFERENCE (G7).
 * - Histórico e persistência via conversation.ts.
 * - logUsage usa a interface corrigida (costKnown, sem costUsd fixo).
 * - Sessão MCP fechada em finally (B1).
 */

import { prisma } from "@/lib/prisma";
import { buildLlmClient } from "./llm/get-client";
import { getActiveLlmConfig } from "./llm/get-active-config";
import { logUsage } from "./llm/usage-logger";
import { createMcpSession, mcpToolsToProviderTools } from "./mcp-client";
import {
  openExternalMcpSessions,
  callExternalTool,
  isExternalToolName,
} from "./external-mcp";
import {
  loadHistory,
  persistMessage,
  assertConversationOwned,
  sanitizeHistoryPairs,
  loadConversationReasoningHistory,
  saveConversationReasoningHistory,
} from "./conversation";
import { reasoningCapsOf } from "./llm/catalog";
import { composeSystemPrompt } from "./prompt/compose";
import { BI_SCHEMA_REFERENCE } from "./bi-schema-reference";
import { progressLabel } from "./progress-labels";
import { searchKb } from "./rag/search";
import { EmbeddingUnavailable } from "./rag/embed";
import type {
  ChatMessage,
  ChatUsage,
  ToolCall,
  ReasoningEffort,
  ReasoningContext,
} from "./llm/types";
import type { AgentChannel } from "@/generated/prisma/client";

/** Limite de iterações do loop de tool calling. */
const MAX_ITERATIONS = 5;

/** Máximo de bytes aceitos no resultado de uma tool call (SPEC §4.3). */
const MAX_TOOL_RESULT_BYTES = 24_576;

/** Roles que recebem o BI_SCHEMA_REFERENCE no prompt (G7). */
const BI_ROLES = new Set(["admin", "super_admin"]);

/** Aviso appended quando o resultado é truncado. */
const TRUNCATION_NOTICE = "\n[...resultado truncado por exceder o limite de tamanho...]";

// Extracao de sugestoes movida para suggestions-extractor.ts (modulo puro,
// testavel sem prisma). Import local para uso interno + re-export para
// nao quebrar imports externos (agent-conversation-export importa daqui).
import {
  extractSuggestions,
  extractBulletQuestions,
  FALLBACK_SUGGESTIONS,
  MAX_SUGGESTIONS,
  MAX_SUGGESTION_LEN,
  MAX_BULLET_EXTRACTION,
} from "./suggestions-extractor";
export {
  extractSuggestions,
  extractBulletQuestions,
  FALLBACK_SUGGESTIONS,
  MAX_SUGGESTIONS,
  MAX_SUGGESTION_LEN,
  MAX_BULLET_EXTRACTION,
};

// FALLBACK_SUGGESTIONS, extractBulletQuestions e extractSuggestions agora
// vivem em suggestions-extractor.ts (modulo puro, sem dep de prisma) para
// permitir testes jest sem fixturizar a cadeia toda. Re-exportados acima.

/**
 * Trunca o resultado de uma tool call para MAX_TOOL_RESULT_BYTES.
 * Appenda aviso de truncagem quando necessário.
 */
function guardToolResult(result: string): string {
  const encoded = Buffer.byteLength(result, "utf8");
  if (encoded <= MAX_TOOL_RESULT_BYTES) return result;
  // Calcula quantos bytes do início cabem dentro do limite
  const truncated = Buffer.from(result, "utf8")
    .slice(0, MAX_TOOL_RESULT_BYTES - Buffer.byteLength(TRUNCATION_NOTICE, "utf8"))
    .toString("utf8");
  return truncated + TRUNCATION_NOTICE;
}

/** Evento emitido durante a execução do agente. */
export type AgentEvent =
  | { type: "thinking" }
  | { type: "token"; delta: string }
  /** `label` é o rótulo genérico exibido na UI; `toolName` é o id cru interno. */
  | { type: "tool_call"; toolName: string; label: string; toolCallId?: string }
  | { type: "tool_result"; toolName: string; truncated: boolean; label: string; toolCallId?: string }
  | { type: "done" };

export interface RunAgentInput {
  conversationId: string;
  userId: string;
  userMessage: string;
  channel: AgentChannel;
  isPlayground: boolean;
  /** Callback para eventos de progresso (streaming in-app). */
  onEvent?: (evt: AgentEvent) => void;
  /** Override de prompt bruto (substitui todo o system prompt). */
  promptOverride?: string;
  /**
   * Override parcial de prompt (Playground): substitui identidade,
   * personalidade, tom e guardrails preservando KB e BI schema.
   */
  promptConfigOverride?: {
    identityBase: string | null;
    personality: string;
    tone: string;
    guardrails: string[];
  };
  /**
   * Override de LLM (Playground): provider, modelo e API key da credencial
   * escolhida na sessão. Quando ausente, usa a config ativa de produção.
   */
  llmOverride?: {
    provider: import("./llm/types").LlmProvider;
    model: string;
    apiKey: string;
  };
  /**
   * Origem do turno (afeta diretrizes do prompt). Default "bubble".
   * Quando "suggestion", o composer instrui o modelo a responder direto.
   */
  source?: import("./prompt/compose").AgentPromptSource;
}

export type RunAgentResult =
  | { ok: true; message: string; suggestions: string[]; usage: ChatUsage }
  | { ok: false; error: string };

/** Valida o reasoningEffort vindo do banco; valor inválido ou ausente vira null. */
function normalizeReasoningEffort(
  value: string | null | undefined,
): ReasoningEffort | null {
  if (
    value === "auto" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  ) {
    return value;
  }
  return null;
}

/** Carrega o singleton AgentSettings do banco (fallback alinhado com @default do schema). */
async function loadAgentSettings() {
  const row = await prisma.agentSettings.findUnique({ where: { id: "global" } });
  return {
    identityBase: row?.identityBase ?? null,
    personality: row?.personality ?? "",
    tone: row?.tone ?? "",
    guardrails: (row?.guardrails as string[]) ?? [],
    advancedOverride: row?.advancedOverride ?? null,
    // @default(true) no schema , alinhar fallback para evitar comportamento diferente
    // em instâncias novas antes da primeira gravação em AgentSettings.
    kbEnabled: (row?.kbCheckpoint ?? "PRODUCTION") === "PRODUCTION",
    terminology: (row?.terminology as Record<string, string>) ?? {},
    suggestionsEnabled: row?.suggestionsEnabled ?? true,
    reasoningEffort: normalizeReasoningEffort(row?.reasoningEffort),
    reasoningCheckpoint: row?.reasoningCheckpoint ?? "OFF",
    maxSuggestions: row?.maxSuggestions ?? 3,
  };
}

export async function runAgent(args: RunAgentInput): Promise<RunAgentResult> {
  const session = await createMcpSession(args.userId).catch((err) => {
    console.warn("[runAgent] Falha ao criar sessão MCP:", err);
    return null;
  });
  // MCPs externos (Plugar MCP) municiam o agente com as tools de terceiros.
  // Falha aqui nunca derruba o run: o agente segue só com o MCP interno.
  const externalBundle = await openExternalMcpSessions().catch((err) => {
    console.warn("[runAgent] Falha ao abrir MCPs externos:", err);
    return null;
  });

  try {
    // Resolver LLM: override da sessão de playground tem prioridade sobre a
    // config ativa de produção.
    let resolvedLlm: {
      provider: import("./llm/types").LlmProvider;
      model: string;
      apiKey: string;
      credentialId?: string | null;
    };
    if (args.llmOverride) {
      resolvedLlm = args.llmOverride;
    } else {
      const llmConfig = await getActiveLlmConfig();
      if (!llmConfig) {
        return {
          ok: false,
          error: "Nenhum provedor de IA configurado. Configure uma credencial LLM.",
        };
      }
      resolvedLlm = {
        provider: llmConfig.provider,
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
        credentialId: llmConfig.credentialId,
      };
    }

    // Garantir ownership da conversa
    await assertConversationOwned(args.conversationId, args.userId);

    // Construir cliente LLM
    const client = buildLlmClient(resolvedLlm.provider, resolvedLlm.apiKey, resolvedLlm.model);

    // Carregar PlatformRole do usuário para BI schema (G7)
    const userRecord = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { platformRole: true },
    });
    const platformRole = userRecord?.platformRole ?? null;
    const biSchema = platformRole && BI_ROLES.has(platformRole) ? BI_SCHEMA_REFERENCE : undefined;

    // Carregar AgentSettings do banco
    const agentSettings = await loadAgentSettings();

    // Buscar snippets da KB por similaridade (RAG , onda 7)
    // Se KB estiver habilitada, tenta searchKb; sem embedding → fallback interno do search.
    let kbSnippets: { name: string; extractedText: string }[] = [];
    if (agentSettings.kbEnabled) {
      try {
        kbSnippets = await searchKb(args.userMessage, 5);
      } catch (err) {
        if (!(err instanceof EmbeddingUnavailable)) {
          console.warn("[runAgent] Erro ao buscar KB:", err);
        }
        // EmbeddingUnavailable é tratado internamente por searchKb (fallback)
      }
    }

    // Compor system prompt , playground pode sobrepor a config do prompt
    // (identidade/personalidade/tom/guardrails) sem afetar KB nem BI schema.
    const promptCfg = {
      ...agentSettings,
      ...(args.promptConfigOverride
        ? {
            identityBase: args.promptConfigOverride.identityBase,
            personality: args.promptConfigOverride.personality,
            tone: args.promptConfigOverride.tone,
            guardrails: args.promptConfigOverride.guardrails,
          }
        : {}),
      advancedOverride: args.promptOverride ?? agentSettings.advancedOverride,
    };
    const systemPrompt = composeSystemPrompt(
      promptCfg,
      kbSnippets,
      undefined,
      biSchema,
      args.source ?? (args.isPlayground ? "playground" : "bubble"),
    );

    // Carregar tools do MCP interno + dos MCPs externos plugados.
    // Nomes com caracteres fora de [a-zA-Z0-9_-] (ex.: `crm.res_partner.get`)
    // são saneados , a OpenAI recusa nome de function com ponto. `nomeRealDaTool`
    // mapeia o nome saneado de volta ao real na hora de chamar a tool.
    const mcpToolsRaw = session ? await session.listTools() : [];
    const nomeRealDaTool = new Map<string, string>();
    const sanearTool = <T extends { name: string }>(t: T): T => {
      const seguro = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      if (seguro === t.name) return t;
      nomeRealDaTool.set(seguro, t.name);
      return { ...t, name: seguro };
    };
    const mcpTools = mcpToolsRaw.map(sanearTool);
    const tools = mcpToolsToProviderTools([
      ...mcpTools,
      ...(externalBundle?.tools ?? []).map(sanearTool),
    ]);

    // Carregar histórico (últimas 20 msgs) e sanitizar pares tool_use/tool_result
    const rawHistory = await loadHistory(args.conversationId, 20);
    const sanitizedHistory = sanitizeHistoryPairs(rawHistory);
    const historyMessages: ChatMessage[] = sanitizedHistory.map((m) => ({
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      ...(m.toolCalls ? { toolCalls: m.toolCalls as ToolCall[] } : {}),
    }));

    // Persistir mensagem do usuário
    await persistMessage(args.conversationId, "user", args.userMessage);

    // Montar conversa inicial
    const conversation: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: args.userMessage },
    ];

    const totalUsage: ChatUsage = { tokensInput: 0, tokensOutput: 0, costUsd: 0 };
    const start = Date.now();
    // Promessas de logUsage pendentes , aguardadas antes de qualquer return para
    // garantir que o registro de uso seja gravado mesmo que o processo encerre
    // logo após a resposta (request serverless / job do worker).
    const usageWrites: Promise<unknown>[] = [];

    // Onda 2 da modernizacao: carregar historico opaco de raciocinio acumulado
    // em iteracoes anteriores da MESMA conversa. Cada adapter (Anthropic,
    // Gemini, OpenRouter) injeta esses blocos no formato exigido pelo provider
    // antes de fazer a chamada. OpenAI segue stateless via Responses API.
    const reasoningHistory: ReasoningContext[] = await loadConversationReasoningHistory(
      args.conversationId,
    ).catch(() => [] as ReasoningContext[]);

    args.onEvent?.({ type: "thinking" });

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const iterStart = Date.now();

      // Na iteração final (ou quando não há mais tools esperadas), tenta streamar
      // tokens para o callback onEvent , heurística: streamar sempre e usar os
      // tokens visualmente só quando stop_reason não for tool_use.
      const onToken = args.onEvent
        ? (delta: string) => args.onEvent!({ type: "token", delta })
        : undefined;

      // Onda 2 da modernizacao: checkpoint + cap funcional ponta a ponta.
      //   OFF        => nunca envia reasoning.
      //   PLAYGROUND => envia só quando source=playground.
      //   PRODUCTION => envia em bubble + playground + whatsapp.
      // Alem do checkpoint, valida a capability do modelo: cap=null,
      // cap.enabled=false ou cap.supportsWithTools=false => drop silencioso.
      const cap = reasoningCapsOf(client.model);
      const checkpointAllows =
        agentSettings.reasoningCheckpoint === "PRODUCTION" ||
        (agentSettings.reasoningCheckpoint === "PLAYGROUND" && args.isPlayground);
      const reasoningAllowed =
        cap !== null &&
        cap.enabled &&
        cap.supportsWithTools &&
        checkpointAllows;
      const effortForRequest: ReasoningEffort | undefined = !reasoningAllowed
        ? undefined
        : cap!.levels.length === 1 && cap!.levels[0] === "auto"
          ? "auto"
          : agentSettings.reasoningEffort ?? undefined;

      const result = await client.chat({
        messages: conversation,
        tools,
        stream: !!onToken,
        onToken,
        reasoningEffort: effortForRequest,
        reasoningHistory,
      });

      // Acumular o contexto opaco para o proximo turno e para persistencia.
      if (result.reasoningContext) {
        reasoningHistory.push(result.reasoningContext);
      }

      totalUsage.tokensInput += result.usage.tokensInput;
      totalUsage.tokensOutput += result.usage.tokensOutput;
      totalUsage.costUsd += result.usage.costUsd ?? 0;

      // Registrar uso desta iteração (aguardado antes do return , ver usageWrites)
      usageWrites.push(
        logUsage({
        provider: client.provider,
        model: client.model,
        credentialId: resolvedLlm.credentialId ?? undefined,
        tokensInput: result.usage.tokensInput,
        tokensOutput: result.usage.tokensOutput,
        reasoningTokens: result.reasoningTokens ?? null,
        conversationId: args.conversationId,
        userId: args.userId,
        durationMs: Date.now() - iterStart,
        promptChars: i === 0 ? args.userMessage.length : 0,
        responseChars: result.message.length,
        isPlayground: args.isPlayground,
          errorMessage:
            i === MAX_ITERATIONS - 1 && (result.toolCalls?.length ?? 0) > 0
              ? "max_iterations_exceeded"
              : undefined,
        }),
      );

      if (!result.toolCalls?.length) {
        // Resposta final , limite vem do AgentSettings (default 3, hard cap 5).
        const { message, suggestions } = extractSuggestions(
          result.message,
          agentSettings.maxSuggestions,
        );
        await persistMessage(args.conversationId, "assistant", message);
        // Persistir historico de raciocinio para o proximo turno (capa interna).
        try {
          await saveConversationReasoningHistory(args.conversationId, reasoningHistory);
        } catch (err) {
          console.warn("[runAgent] Falha ao persistir reasoning_history:", err);
        }
        args.onEvent?.({ type: "done" });
        void start;
        await Promise.allSettled(usageWrites);
        return { ok: true, message, suggestions, usage: totalUsage };
      }

      // Adiciona assistant com tool_calls
      conversation.push({
        role: "assistant",
        content: result.message,
        toolCalls: result.toolCalls,
      });

      // Persistir assistant com toolCalls
      await persistMessage(args.conversationId, "assistant", result.message, result.toolCalls);

      // Executar cada tool via MCP. Onda D do Renascimento:
      //   - Cache intra-sessao por (tool, args) com TTL 60s reduz latencia
      //     quando o agente repete a mesma chamada no mesmo loop ou turno.
      //   - Telemetria leve via console.info: tool + ms + status, util para
      //     identificar gargalos sem painel UI (que vem em proxima onda).
      const { getCachedToolResult, setCachedToolResult } = await import(
        "./session-cache"
      );
      for (const tc of result.toolCalls) {
        args.onEvent?.({
          type: "tool_call",
          toolName: tc.name,
          label: progressLabel(tc.name),
          toolCallId: tc.id,
        });

        const toolArgs = (tc.arguments ?? {}) as Record<string, unknown>;
        let toolResultStr: string;
        let cacheHit = false;
        const tStart = Date.now();
        const cached = getCachedToolResult(args.conversationId, tc.name, toolArgs);
        if (cached !== null) {
          toolResultStr = cached;
          cacheHit = true;
        } else if (isExternalToolName(tc.name)) {
          // Tool de MCP externo: roteia para a sessão do servidor certo.
          toolResultStr = externalBundle
            ? await callExternalTool(externalBundle, nomeRealDaTool.get(tc.name) ?? tc.name, toolArgs, args.userId)
            : "(MCP externo indisponível)";
        } else if (session) {
          toolResultStr = await session.callTool(nomeRealDaTool.get(tc.name) ?? tc.name, toolArgs);
        } else {
          toolResultStr = "(MCP indisponível)";
        }
        if (!cacheHit && toolResultStr) {
          setCachedToolResult(args.conversationId, tc.name, toolArgs, toolResultStr);
        }
        const ms = Date.now() - tStart;
        try {
          // Telemetria leve, sem PII de payload (so meta).
          console.info(
            "[nex:tool]",
            JSON.stringify({
              tool: tc.name,
              ms,
              cacheHit,
              conversationId: args.conversationId,
            }),
          );
        } catch {
          /* swallow */
        }

        // G6: normalizar para string (já feito pelo session.callTool) + guard de tamanho
        const guarded = guardToolResult(toolResultStr);
        const wasTruncated = guarded !== toolResultStr;

        args.onEvent?.({
          type: "tool_result",
          toolName: tc.name,
          truncated: wasTruncated,
          label: progressLabel(tc.name),
          toolCallId: tc.id,
        });

        conversation.push({
          role: "tool",
          toolCallId: tc.id,
          toolName: tc.name,
          content: guarded,
        });
      }
    }

    // Esgotou iterações
    await Promise.allSettled(usageWrites);
    return {
      ok: false,
      error: "O agente ficou em loop. Tente reformular a pergunta.",
    };
  } catch (err) {
    console.error("[runAgent] Erro inesperado:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno do agente.",
    };
  } finally {
    if (session) await session.close();
    if (externalBundle) await externalBundle.closeAll();
  }
}
