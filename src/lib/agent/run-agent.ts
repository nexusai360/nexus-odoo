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
import {
  formatDateInTz,
  DEFAULT_TZ,
  DEFAULT_LOCALE,
} from "@/lib/datetime-core";
import { montarConversa } from "./prompt/montar-conversa";
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
  persistMessageAndReturnId,
  persistAssistantMessageWithTools,
  updateMessageToolResults,
  // findInventedValues importado mais abaixo.
  assertConversationOwned,
  sanitizeHistoryPairs,
  loadConversationReasoningHistory,
  saveConversationReasoningHistory,
} from "./conversation";
import { reasoningCapsOf } from "./llm/catalog";
import { composeSystemPrompt } from "./prompt/compose";
import { enhanceWithChips } from "./enhance-chips";
import { BI_SCHEMA_REFERENCE } from "./bi-schema-reference";
import { progressLabel } from "./progress-labels";
import { searchKb } from "./rag/search";
import { EmbeddingUnavailable } from "./rag/embed";
// R1 router de catalogo (sub-projeto do roadmap de cobertura completa).
// Ver docs/superpowers/specs/2026-05-28-router-catalogo-design.md.
import { pickDomains } from "./router/pick-domains";
import { resolveContextWindow, type ContextCheckpoint } from "./context-window";
import { reformulateQuestion } from "./router/contextualize";
import { resolveReformLlm } from "./router/get-reform-config";
import { filterCatalog, EXCLUDE_FROM_FILTERING } from "./router/filter-catalog";
import { createDecision, updateDecision } from "./router/log-decision";
import { getToolDomain, UNKNOWN_DOMAIN } from "./router/tool-to-domain";
import { respondPermissionDenied } from "./permission-denial";
import { seesAll } from "@/lib/reports/domains";
import type {
  ChatMessage,
  ChatUsage,
  ToolCall,
  ReasoningEffort,
  ReasoningContext,
} from "./llm/types";
import type { AgentChannel } from "@/generated/prisma/client";

/** Limite de iterações do loop de tool calling.
 *  Reduzido de 5 para 3 em 2026-05-25 apos prints recorrentes de "loop"
 *  (7+ tool calls em uma mesma resposta). 3 iteracoes cobrem casos
 *  legitimos (consulta inicial + consulta complementar + finalizacao)
 *  sem dar margem pro modelo encadear tool calls especulativas. */
const MAX_ITERATIONS = 3;

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
 *
 * T-35 (Ronda 2 BUG RAIZ): a versao antiga truncava o JSON do INICIO,
 * cortando os campos canonicos (_RESPOSTA, _DESTAQUE, _agregado, topMaiores,
 * topPorParticipante) que ficam no FIM do objeto. Isso impedia o V5/V5b
 * de detectar invencao numerica, porque o curado nem chegava ao validator
 * — e o LLM nao via o total agregado, recusando com "nao consegui
 * consolidar".
 *
 * Estrategia nova:
 * 1. Tenta parsear o JSON. Se for envelope ({ estado, dados }) com lista
 *    grande em `dados.titulos`/`dados.linhas`/`dados.serie`, encurta a
 *    lista para os primeiros 30 itens (sample) e remonta o JSON com os
 *    campos canonicos PRESERVADOS.
 * 2. Se ainda nao couber, encurta mais ate caber.
 * 3. Se nao for parseavel ou nao for envelope, fallback pra truncagem do
 *    inicio (comportamento antigo, conservador).
 */
function guardToolResult(result: string): string {
  const encoded = Buffer.byteLength(result, "utf8");
  if (encoded <= MAX_TOOL_RESULT_BYTES) return result;

  // Tentativa smart: encurta listas internas preservando campos canonicos.
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object" && "estado" in parsed && "dados" in parsed) {
      const dados = (parsed as { dados: Record<string, unknown> }).dados;
      if (dados && typeof dados === "object") {
        for (const listaKey of ["titulos", "linhas", "serie", "top"] as const) {
          const v = dados[listaKey];
          if (Array.isArray(v) && v.length > 30) {
            (dados as Record<string, unknown>)[listaKey] = v.slice(0, 30);
            (dados as Record<string, unknown>)._amostraReduzida = {
              de: v.length,
              para: 30,
              motivo: "tool result excedeu limite; use _RESPOSTA, _DESTAQUE, _agregado, topMaiores ou topPorParticipante (preservados) para o total.",
            };
          }
        }
        const rebuilt = JSON.stringify(parsed);
        if (Buffer.byteLength(rebuilt, "utf8") <= MAX_TOOL_RESULT_BYTES) {
          return rebuilt;
        }
        // Ainda nao coube: encurta listas mais ate 10 itens.
        for (const listaKey of ["titulos", "linhas", "serie", "top"] as const) {
          const v = dados[listaKey];
          if (Array.isArray(v) && v.length > 10) {
            (dados as Record<string, unknown>)[listaKey] = v.slice(0, 10);
          }
        }
        const rebuilt2 = JSON.stringify(parsed);
        if (Buffer.byteLength(rebuilt2, "utf8") <= MAX_TOOL_RESULT_BYTES) {
          return rebuilt2;
        }
      }
    }
  } catch {
    // nao-JSON ou parse falhou; usa fallback abaixo
  }

  // Fallback (comportamento antigo): trunca do inicio. Nao preserva canonicos
  // mas pelo menos nao quebra a chamada do LLM.
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

/**
 * Carrega o singleton AgentSettings do banco (fallback alinhado com @default
 * do schema).
 *
 * CRÍTICO , flag usesCodeDefaults: quando true (default em instalações novas
 * E após reset via UI), retorna IDENTITY_BASE/DEFAULT_PERSONALITY/DEFAULT_TONE/
 * DEFAULT_GUARDRAILS do CÓDIGO. Isso resolve o drift dev/banco: dev edita o
 * código e a mudança REFLETE imediatamente sem precisar UPDATE manual.
 * Quando false, admin customizou via UI e o banco vira fonte da verdade.
 */
async function loadAgentSettings() {
  const row = await prisma.agentSettings.findUnique({ where: { id: "global" } });
  const useCode = row?.usesCodeDefaults ?? true;
  // R1 router de catalogo: env override (kill-switch nivel 3 do §16.3 da SPEC).
  const routerForceDisable = process.env.ROUTER_FORCE_DISABLE === "true";
  return {
    identityBase: useCode
      ? (await import("@/lib/agent/prompt/identity-base")).IDENTITY_BASE
      : (row?.identityBase ?? null),
    personality: useCode
      ? (await import("@/lib/agent/prompt/defaults")).DEFAULT_PERSONALITY
      : (row?.personality ?? ""),
    tone: useCode
      ? (await import("@/lib/agent/prompt/defaults")).DEFAULT_TONE
      : (row?.tone ?? ""),
    guardrails: useCode
      ? (await import("@/lib/agent/prompt/defaults")).DEFAULT_GUARDRAILS
      : ((row?.guardrails as string[]) ?? []),
    advancedOverride: row?.advancedOverride ?? null,
    // @default(true) no schema , alinhar fallback para evitar comportamento diferente
    // em instâncias novas antes da primeira gravação em AgentSettings.
    kbEnabled: (row?.kbCheckpoint ?? "PRODUCTION") === "PRODUCTION",
    terminology: (row?.terminology as Record<string, string>) ?? {},
    suggestionsEnabled: row?.suggestionsEnabled ?? true,
    reasoningEffort: normalizeReasoningEffort(row?.reasoningEffort),
    reasoningCheckpoint: row?.reasoningCheckpoint ?? "OFF",
    maxSuggestions: row?.maxSuggestions ?? 3,
    // R1 router de catalogo (sub-projeto do roadmap de cobertura completa).
    routerEnabled: !routerForceDisable && ((row?.routerEnabled as boolean | undefined) ?? false),
    routerThreshold: (row?.routerThreshold as number | undefined) ?? 0.30,
    routerTopK: (row?.routerTopK as number | undefined) ?? 3,
    routerRetryExpandBelow: (row?.routerRetryExpandBelow as number | undefined) ?? 0.7,
    routerRetryEnabled: (row?.routerRetryEnabled as boolean | undefined) ?? false,
    // R2-ctx: roteamento contextual (Camada 2) + escolha de modelo de embedding.
    routerReformCheckpoint: (row?.routerReformCheckpoint as string | undefined) ?? "OFF",
    routerReformProvider: row?.routerReformProvider ?? null,
    routerReformModel: row?.routerReformModel ?? null,
    routerReformCredentialId: row?.routerReformCredentialId ?? null,
    routerReformNPairs: (row?.routerReformNPairs as number | undefined) ?? 5,
    routerEmbeddingModel: row?.routerEmbeddingModel ?? null,
    // R2-ctx: janela de contexto da resposta.
    contextWindowCheckpoint: (row?.contextWindowCheckpoint as string | undefined) ?? "PRODUCTION",
    contextWindowSize: (row?.contextWindowSize as number | undefined) ?? 20,
    contextWindowIncludeSystem: (row?.contextWindowIncludeSystem as boolean | undefined) ?? true,
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

  // Declarado fora do try pra ficar acessivel no catch externo
  // (usado pelo trigger FALHA_TECNICA do /agente/qualidade , Onda 3a).
  let resolvedLlm:
    | {
        provider: import("./llm/types").LlmProvider;
        model: string;
        apiKey: string;
        credentialId?: string | null;
      }
    | undefined;

  try {
    // Resolver LLM: override da sessão de playground tem prioridade sobre a
    // config ativa de produção.
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

    // O cliente LLM e construido APOS o fast-path de recusa (SPEC §6.2): no
    // caminho de permission-denied nenhum cliente LLM e instanciado nem
    // chamado (custo zero). Ver `const client = buildLlmClient(...)` abaixo do
    // bloco do fast-path.

    // Carregar PlatformRole do usuário para BI schema (G7)
    const userRecord = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { platformRole: true },
    });
    const platformRole = userRecord?.platformRole ?? null;
    const biSchema = platformRole && BI_ROLES.has(platformRole) ? BI_SCHEMA_REFERENCE : undefined;

    // RBAC v2 (SPEC §6.1): camada B do gate de permissão. Quando super_admin
    // ou admin, retorna "all" sem query (short-circuit seesAll). Para os
    // demais, busca os domínios concedidos em UserDomainAccess.
    // Usa prisma direto (não getUserDomains de @/lib/actions/) para evitar
    // puxar a cadeia de next-auth no contexto do worker.
    // try/catch defensivo: mocks de teste antigos podem não exporem
    // userDomainAccess; fallback para set vazio mantém compatibilidade.
    let userAllowedDomains: Set<string> | "all";
    if (platformRole && seesAll(platformRole)) {
      userAllowedDomains = "all";
    } else if (platformRole) {
      try {
        const granted = await prisma.userDomainAccess.findMany({
          where: { userId: args.userId },
          select: { domain: true },
        });
        userAllowedDomains = new Set(granted.map((g) => g.domain));
      } catch {
        userAllowedDomains = new Set();
      }
    } else {
      userAllowedDomains = new Set();
    }

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
    const systemPromptBase = composeSystemPrompt(
      promptCfg,
      kbSnippets,
      undefined,
      biSchema,
      args.source ?? (args.isPlayground ? "playground" : "bubble"),
    );
    // Otimizacao de custo (alavanca 1): a data NAO vai mais no topo do prompt.
    // O cache da OpenAI desconta a porcao PREFIXO identica entre chamadas; com a
    // data (que muda) no topo, nada do system ficava cacheavel. Agora o
    // systemPrompt e' so o base (prefixo estavel) e a data entra como item de
    // input logo antes da pergunta, via montarConversa(). Granularidade de dia
    // (dia da semana + data), sem hora/segundos.
    const agoraBrt = formatDateInTz(new Date(), DEFAULT_TZ, DEFAULT_LOCALE, {
      weekday: "long",
    });
    const systemPrompt = systemPromptBase;

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
    const externalToolsSan = (externalBundle?.tools ?? []).map(sanearTool);
    const allToolsBeforeRouter = [...mcpTools, ...externalToolsSan];

    // R1 router de catalogo: filtra catalogo entregue ao LLM por similaridade
    // semantica. Default shadow: nao filtra, so loga decisao. Ativacao gradual
    // via AgentSettings.routerEnabled. Ver spec §5.
    const routerSettings = {
      threshold: agentSettings.routerThreshold,
      topK: agentSettings.routerTopK,
    };
    // Camada 1: embedding da pergunta crua. Telemetria origem "router".
    const decisaoL1 = await pickDomains(args.userMessage, routerSettings, {
      origin: "router",
      conversationId: args.conversationId,
      userId: args.userId,
      isPlayground: args.isPlayground,
    });
    let decisaoFinal = decisaoL1;
    let reformulated: string | null = null;

    // Camada 2 (R2-ctx): só quando a Camada 1 caiu em fallback E a Construção
    // da pergunta está ativa para a superfície E o router está ATIVO (em shadow
    // o catálogo não é filtrado, então não gastamos LLM). A resposta do agente
    // continua usando args.userMessage; a reformulada serve só para rotear.
    const reformActive =
      agentSettings.routerReformCheckpoint === "PRODUCTION" ||
      (agentSettings.routerReformCheckpoint === "PLAYGROUND" && Boolean(args.isPlayground));
    if (decisaoL1.fallback.triggered && reformActive && agentSettings.routerEnabled) {
      const reformLlm = await resolveReformLlm(agentSettings);
      if (reformLlm) {
        const r = await reformulateQuestion({
          conversationId: args.conversationId ?? null,
          currentQuestion: args.userMessage,
          nPairs: agentSettings.routerReformNPairs,
          llm: { provider: reformLlm.provider, apiKey: reformLlm.apiKey, model: reformLlm.model },
          credentialId: reformLlm.credentialId,
          userId: args.userId,
          isPlayground: args.isPlayground,
        });
        if (r.reformulated) {
          reformulated = r.reformulated;
          // Camada 3: re-embedding da pergunta reformulada. Telemetria origem
          // "router" (a chamada LLM já logou "router_reformulacao").
          decisaoFinal = await pickDomains(reformulated, routerSettings, {
            origin: "router",
            conversationId: args.conversationId,
            userId: args.userId,
            isPlayground: args.isPlayground,
          });
        }
      }
    }

    const routerMode: "shadow" | "active" = agentSettings.routerEnabled
      ? "active"
      : "shadow";
    // RBAC v2: createDecision precede filterCatalog para que routerDecisionId
    // já esteja disponível para o fast-path de recusa (Onda E). A decisão
    // gravada é a FINAL (Camada 3 quando houve reformulação); os campos de
    // origem preservam a Camada 1.
    const routerLog = await createDecision({
      decision: decisaoFinal,
      mode: routerMode,
      catalogSizeOffered: 0,
      catalogSizeFull: allToolsBeforeRouter.length,
      userQuestion: args.userMessage,
      conversationId: args.conversationId ?? null,
      llmModelUsed: null,
      originalFallback: decisaoL1.fallback.triggered,
      usedReformulation: reformulated !== null,
      reformulatedQuestion: reformulated,
    });
    const routerDecisionId = routerLog.decisionId;

    // RBAC v2 (SPEC §6.2): fast-path de recusa SEM LLM. Quando a pergunta cai
    // inteiramente em dominio(s) fora do acesso do usuario (e o router teve
    // confianca , sem fallback), respondemos com template e custo zero.
    // So dispara quando ha 1+ dominio nao-transversal detectado E nenhum deles
    // intersecta o acesso do usuario. Mistura de dominios (interseção >= 1)
    // NAO dispara: cai no filterCatalog + LLM (SPEC §6.6).
    if (
      userAllowedDomains !== "all" &&
      !decisaoFinal.fallback.triggered &&
      decisaoFinal.pickedDomains.length > 0
    ) {
      const nonTransversal = decisaoFinal.pickedDomains.filter(
        (d) => !EXCLUDE_FROM_FILTERING.has(d),
      );
      const intersected = nonTransversal.filter((d) =>
        (userAllowedDomains as Set<string>).has(d),
      );
      if (intersected.length === 0 && nonTransversal.length > 0) {
        // O bloco finally (fim da funcao) fecha session + externalBundle.
        return await respondPermissionDenied({
          conversationId: args.conversationId,
          userId: args.userId,
          deniedDomains: nonTransversal,
          availableDomains: [...userAllowedDomains],
          routerDecisionId,
          userQuestion: args.userMessage,
        });
      }
    }

    // Passou o fast-path: agora sim instanciamos o cliente LLM.
    const client = buildLlmClient(resolvedLlm.provider, resolvedLlm.apiKey, resolvedLlm.model);

    const filteredCatalog = filterCatalog({
      allTools: allToolsBeforeRouter,
      decision: decisaoFinal,
      routerEnabled: agentSettings.routerEnabled,
      userAllowedDomains,
    });
    // Atualiza catalogSizeOffered após o filtro real (camadas A + B do RBAC v2).
    await updateDecision({
      decisionId: routerDecisionId,
      catalogSizeOffered: filteredCatalog.tools.length,
    });
    const allTurnToolNames: string[] = [];

    const tools = mcpToolsToProviderTools(filteredCatalog.tools);

    // Carregar histórico e sanitizar pares tool_use/tool_result. R2-ctx: a
    // janela (quantas msgs + se inclui sistema/tools) vem do AgentSettings,
    // resolvida por superfície/checkpoint. Default preserva 20 msgs/todos papéis.
    const cw = resolveContextWindow(
      {
        checkpoint: agentSettings.contextWindowCheckpoint as ContextCheckpoint,
        size: agentSettings.contextWindowSize,
        includeSystem: agentSettings.contextWindowIncludeSystem,
      },
      { isPlayground: Boolean(args.isPlayground) },
    );
    const rawHistory = await loadHistory(args.conversationId, cw.budget, {
      includeSystem: cw.includeSystem,
    });
    const sanitizedHistory = sanitizeHistoryPairs(rawHistory);
    const historyMessages: ChatMessage[] = sanitizedHistory.map((m) => ({
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      ...(m.toolCalls ? { toolCalls: m.toolCalls as ToolCall[] } : {}),
    }));

    // Persistir mensagem do usuário
    await persistMessage(args.conversationId, "user", args.userMessage);

    // Montar conversa inicial. A data atual entra como item de input antes da
    // pergunta (fora do prefixo cacheavel), via montarConversa().
    const { conversation } = montarConversa({
      systemPromptBase: systemPrompt,
      historyMessages,
      userMessage: args.userMessage,
      agoraBrt,
    });

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

    // Acumula TODOS os tool results do turno (across iteracoes) para guardrail
    // factual final. Auditoria 2026-05-26 mostrou 12 turnos ERRADO com
    // `dado_inventado` , agente citava numeros que nao apareciam em nenhum
    // toolResult do turno.
    const allTurnToolResults: string[] = [];
    // Nomes de todas as tools chamadas neste turno (qualquer iteracao). Usado
    // pela rede de seguranca de gap: saber se `registrar_lacuna` ja foi
    // chamada antes de auto-registrar uma recusa.
    const turnToolNames = new Set<string>();

    // Onda 1.E (Onda Nex >=90%): coleta estruturada dos tool results para o
    // AutoValidator. Cada item tem toolName + dados parseados (envelope canonico
    // quando aplicavel). Default = shadow mode (so loga retryReason, nao retenta).
    const allTurnEnvelopes: Array<{
      toolName: string;
      dados?: Record<string, unknown>;
    }> = [];

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
      totalUsage.tokensCachedInput =
        (totalUsage.tokensCachedInput ?? 0) + (result.usage.tokensCachedInput ?? 0);
      totalUsage.costUsd += result.usage.costUsd ?? 0;

      // Registrar uso desta iteração (aguardado antes do return , ver usageWrites)
      usageWrites.push(
        logUsage({
        provider: client.provider,
        model: client.model,
        credentialId: resolvedLlm.credentialId ?? undefined,
        tokensInput: result.usage.tokensInput,
        tokensOutput: result.usage.tokensOutput,
        tokensCachedInput: result.usage.tokensCachedInput ?? 0,
        reasoningTokens: result.reasoningTokens ?? null,
        toolCallsCount: result.toolCalls?.length ?? 0,
        toolNames: result.toolCalls?.map((t) => t.name) ?? [],
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
        // Resposta final. Tenta Two-pass enhance: extrai bullets-perguntas
        // como chips e remove do corpo. Em falha, fallback para
        // extractSuggestions (canal [[suggestions]] do prompt).
        let message: string;
        let suggestions: string[];
        const shouldEnhance =
          (args.source === "bubble" || args.source === "suggestion") &&
          result.message.length > 0;
        if (shouldEnhance) {
          try {
            const enhanced = await enhanceWithChips({
              client,
              agentResponse: result.message,
              recentHistory: conversation.slice(-5),
              maxContextual: agentSettings.maxSuggestions,
            });
            message = enhanced.cleanMessage;
            suggestions = enhanced.chips;
          } catch (err) {
            console.warn(
              "[runAgent] enhanceWithChips fallback:",
              err instanceof Error ? err.message : err,
            );
            const fb = extractSuggestions(result.message, agentSettings.maxSuggestions);
            message = fb.message;
            suggestions = fb.suggestions;
          }
        } else {
          const fb = extractSuggestions(result.message, agentSettings.maxSuggestions);
          message = fb.message;
          suggestions = fb.suggestions;
        }

        // TRAVAS das sugestoes (suggestion-filter): (1) nunca sugerir uma
        // pergunta que JA foi feita nesta conversa (clicada ou digitada);
        // (2) nunca sugerir um GAP conhecido (feature_requests). Independe do
        // usuario: os gaps sao globais. Falha aqui nao derruba a resposta.
        try {
          const [askedRows, gapRows] = await Promise.all([
            prisma.message.findMany({
              where: { conversationId: args.conversationId, role: "user" },
              select: { content: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
            prisma.featureRequest.findMany({
              select: { perguntaResumo: true },
              orderBy: { criadoEm: "desc" },
              take: 400,
            }),
          ]);
          const { filterSuggestions } = await import("./suggestion-filter");
          suggestions = filterSuggestions(suggestions, {
            asked: askedRows.map((r) => r.content),
            gaps: gapRows.map((r) => r.perguntaResumo),
          });
        } catch (err) {
          console.warn("[runAgent] suggestion-filter falhou:", err);
        }

        // REDE DE SEGURANCA de gap (independe do usuario): se a IA recusou com
        // o template de "sem dados / fora do escopo" e NAO chamou
        // `registrar_lacuna` neste turno, registra o gap em feature_requests.
        // Assim toda pergunta sem-resposta entra no quadro e deixa de aparecer
        // como sugestao (trava 2). Conservador: so o template + dedup por texto.
        try {
          const refusalRe =
            /n[ãa]o tenho dados suficientes|fora do (meu )?escopo|n[ãa]o (consigo|tenho como|tenho dados para) (te )?responder|n[ãa]o (tenho|possuo) (essa informa|essa métrica|essa metrica)/i;
          if (
            refusalRe.test(message) &&
            !turnToolNames.has("registrar_lacuna")
          ) {
            const resumo = args.userMessage.trim().slice(0, 300);
            if (resumo.length > 0) {
              const exists = await prisma.featureRequest.findFirst({
                where: { perguntaResumo: resumo },
                select: { id: true },
              });
              if (!exists) {
                await prisma.featureRequest.create({
                  data: {
                    userId: args.userId,
                    perguntaResumo: resumo,
                    dominio: null,
                  },
                });
              }
            }
          }
        } catch (err) {
          console.warn("[runAgent] safety-net gap log falhou:", err);
        }

        // STRIPPER DEFENSIVO de placeholder freshness "Xs" (Onda A1, audit
        // R0 mostrou 12.7%/624 turnos com esse bug). O envelope da tool ja
        // expoe `atualizadoHa` pre-computado server-side; o prompt instrui
        // a usar; este stripper limpa o residual quando o LLM falha.
        try {
          const { stripFreshnessPlaceholders } = await import(
            "./quality/freshness-stripper"
          );
          message = stripFreshnessPlaceholders(message);
        } catch (err) {
          console.warn("[runAgent] freshness stripper falhou:", err);
        }

        // Trava defensiva (2026-05-27): mesmo apos extractSuggestions, garante
        // que nenhum residual de "[[suggestions]]:..." vaza pro usuario na bubble.
        try {
          const { stripCanalSuggestionsResidual } = await import(
            "./suggestions-extractor"
          );
          message = stripCanalSuggestionsResidual(message);
        } catch (err) {
          console.warn("[runAgent] strip canal suggestions falhou:", err);
        }

        // Strip de freshness textual "(atualizado ha X)" do corpo (regra de
        // raiz - usuario nao quer ver tempo de atualizacao na resposta).
        // Mantemos o dado no envelope `atualizadoHa` para uso interno;
        // o LLM nao deve mais imprimir no texto humano.
        try {
          const { stripFreshnessFromText } = await import(
            "./quality/freshness-stripper"
          );
          if (typeof stripFreshnessFromText === "function") {
            message = stripFreshnessFromText(message);
          }
        } catch {
          // Helper opcional; ignora se nao existir ainda.
        }

        // GUARDRAIL FACTUAL (auditoria 2026-05-26 rodada 5):
        // Dois detectores ortogonais:
        //  (a) findInventedValues , valores R$ que nao aparecem em nenhum
        //      toolResult. Threshold: dispara so se >=2 valores E >=50% dos
        //      R$ citados estao flagrados (evita falso positivo de
        //      agregacoes legitimas onde tool retorna linhas individuais e
        //      agente soma um total que nao existe literal no JSON).
        //      Validado contra rodada 4: FP=2.3% (5/214 CORRETO),
        //      TP=30.8% (4/13 ERRADO).
        //  (b) detectsHallucinatedNonEmpty , TODAS as tools vieram vazias
        //      mas resposta nao admite isso. Catch os piores casos de
        //      invento (#3694548f, #8185fe09). FP baixo.
        // Anexa toolResults brutos na correcao para o LLM defender
        // calculos legitimos com referencia factual.
        try {
          const invented = findInventedValues(message, allTurnToolResults);
          const totalMoneyRefs = Array.from(
            message.matchAll(/R\$\s*([\d.,]+)/g),
          ).filter((m) => {
            const n = m[1].replace(/[.,\s]/g, "");
            return n.length >= 3 && !/^0+$/.test(n);
          }).length;
          const inventedRatio =
            totalMoneyRefs > 0 ? invented.length / totalMoneyRefs : 0;
          const moneyGuardTrigger =
            invented.length >= 2 && inventedRatio >= 0.5;
          const hallucinatedEmpty = detectsHallucinatedNonEmpty(
            message,
            allTurnToolResults,
          );
          if (
            (moneyGuardTrigger || hallucinatedEmpty) &&
            allTurnToolResults.length > 0
          ) {
            console.warn(
              "[runAgent] guardrail factual disparado:",
              JSON.stringify({
                invented,
                inventedRatio,
                hallucinatedEmpty,
                moneyGuardTrigger,
              }),
              "conv=",
              args.conversationId,
            );
            // Anexa toolResults brutos (limitados) para o LLM ter referencia
            // factual sem precisar adivinhar. Cap em 8000 chars para nao
            // estourar contexto da chamada de correcao.
            const toolResultsBlob = allTurnToolResults
              .join("\n---\n")
              .slice(0, 8000);
            const correctionBullets: string[] = [];
            if (moneyGuardTrigger) {
              correctionBullets.push(
                "Valores R$ citados que nao aparecem nos toolResults: " +
                  invented.join(", ") +
                  ". Se voce computou agregado/soma a partir das linhas, refaca o calculo e confirme contra os dados; se nao for agregado, REMOVA ou substitua por 'nao consegui obter esse dado'.",
              );
            }
            if (hallucinatedEmpty) {
              correctionBullets.push(
                "TODAS as tools chamadas neste turno retornaram VAZIO (estado=vazio, linhas=[], total=0 ou equivalente). Sua resposta nao pode afirmar valores concretos, listar itens ou apresentar agregados. Declare honestamente que a consulta nao retornou dados.",
              );
            }
            const correctionMessages = [
              ...conversation,
              { role: "assistant" as const, content: message },
              {
                role: "user" as const,
                content:
                  "GUARDRAIL FACTUAL: sua resposta anterior contem problemas factuais.\n\n" +
                  correctionBullets.map((b) => "- " + b).join("\n") +
                  "\n\nREFERENCIA FACTUAL (toolResults BRUTOS deste turno; use APENAS o que esta aqui):\n" +
                  toolResultsBlob +
                  "\n\nREESCREVA sua resposta cumprindo:\n" +
                  "1. NAO adicione informacao que nao esteja explicitamente no bloco acima.\n" +
                  "2. Para qualquer valor/nome/codigo que voce nao tem certeza de origem, NAO escreva , diga 'nao consegui obter esse dado'.\n" +
                  "3. Se as tools vieram vazias, declare isso de forma natural ('Nao encontrei...', 'A consulta nao retornou resultados...').\n" +
                  "4. Mantenha o tom, idioma e formato da resposta original.\n" +
                  "5. NAO chame novas tools. NAO peca clarificacao.\n",
              },
            ];
            try {
              const correction = await client.chat({
                messages: correctionMessages,
                tools: undefined,
                temperature: 0,
                maxTokens: 1024,
                reasoningEffort: undefined,
              });
              if (correction.message && correction.message.trim().length > 0) {
                message = correction.message;
              }
            } catch (errCorr) {
              console.warn("[runAgent] guardrail correction failed:", errCorr);
            }
          }
        } catch (errGuard) {
          console.warn("[runAgent] guardrail factual skipped:", errGuard);
        }

        // Onda 1.E (Nex >=90%): AutoValidator com 3 modos.
        // - off:    nao roda
        // - shadow: roda V1-V4, loga retryReason, NAO retenta
        // - active: roda V1-V4, dispara 1 retry corretivo se falhar (cap=1)
        // Flag em AgentSettings.autoValidatorMode + validatorV{1..4}Enabled.
        // Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A12
        let autoValidatorRetryCount = 0;
        let autoValidatorRetryReason: string | null = null;
        let autoValidatorRetryDetail: string | null = null;
        try {
          const { validateResponse } = await import("./validation/auto-validator");
          const settingsRow = await prisma.agentSettings.findUnique({
            where: { id: "global" },
            select: {
              autoValidatorMode: true,
              validatorV1Enabled: true,
              validatorV2Enabled: true,
              validatorV3Enabled: true,
              validatorV4Enabled: true,
            },
          });
          const mode = settingsRow?.autoValidatorMode ?? "shadow";
          if (mode !== "off") {
            const outcome = validateResponse(
              {
                question: args.userMessage,
                llmResponse: message,
                toolResults: allTurnEnvelopes,
              },
              {
                v1Enabled: settingsRow?.validatorV1Enabled ?? true,
                v2Enabled: settingsRow?.validatorV2Enabled ?? true,
                v3Enabled: settingsRow?.validatorV3Enabled ?? true,
                v4Enabled: settingsRow?.validatorV4Enabled ?? true,
                // V5 (Ronda 1): anti-ignorou_RESPOSTA. Default ativo; sem coluna
                // dedicada no AgentSettings por enquanto (pode ser adicionada
                // se precisar desligar em prod).
                v5Enabled: true,
              },
            );
            if (!outcome.ok) {
              autoValidatorRetryReason = outcome.reason;
              autoValidatorRetryDetail = outcome.detalhe;
              console.warn(
                `[autoValidator:${mode}] ${outcome.reason} fired conversationId=${args.conversationId} detalhe=${outcome.detalhe}`,
              );
              if (mode === "active") {
                // Active mode: 1 retry com hint corretivo, timeout 3s.
                const retryStart = Date.now();
                try {
                  const retryMessages = [
                    ...conversation,
                    { role: "assistant" as const, content: message },
                    {
                      role: "user" as const,
                      content:
                        `AUTOVALIDATOR (${outcome.reason}): sua resposta anterior foi rejeitada.\n\n` +
                        outcome.hint +
                        "\n\nREESCREVA usando apenas o que esta nos toolResults deste turno. " +
                        "Mantenha tom, idioma e formato. NAO chame novas tools. NAO peca clarificacao.",
                    },
                  ];
                  const retryPromise = client.chat({
                    messages: retryMessages,
                    tools: undefined,
                    temperature: 0,
                    maxTokens: 1024,
                    reasoningEffort: undefined,
                  });
                  // Timeout 3s para proteger SLA p95
                  const timeoutPromise = new Promise<never>((_, rej) =>
                    setTimeout(
                      () => rej(new Error("auto-validator retry timeout 3s")),
                      3000,
                    ),
                  );
                  const retry = await Promise.race([retryPromise, timeoutPromise]);
                  if (retry.message && retry.message.trim().length > 0) {
                    message = retry.message;
                    autoValidatorRetryCount = 1;
                    console.warn(
                      `[autoValidator:active] retry OK ${outcome.reason} dur=${Date.now() - retryStart}ms`,
                    );
                  }
                } catch (errRetry) {
                  console.warn(
                    `[autoValidator:active] retry failed (${outcome.reason}): ${(errRetry as Error).message}. Aceitando resposta original.`,
                  );
                }
              }
            }
          }
        } catch (err) {
          console.warn("[autoValidator] failed (top-level):", err);
        }

        const assistantMessageId = await persistMessageAndReturnId(
          args.conversationId,
          "assistant",
          message,
        );

        // Onda 3a: trigger fire-and-forget pro sistema /agente/qualidade.
        // Cria row PENDENTE em ConversationQualityEvaluation. Nao bloqueia
        // o retorno pro usuario. Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.4
        void (async () => {
          try {
            const { createPendingEval } = await import("./quality/trigger");
            await createPendingEval({
              conversationId: args.conversationId,
              assistantMessageId,
              userMessage: args.userMessage,
              answerMessage: message,
              model: client.model,
              suggestions,
              retryCount: autoValidatorRetryCount,
              retryReason: autoValidatorRetryReason,
              retryDetail: autoValidatorRetryDetail,
            });
          } catch (err) {
            console.warn(
              "[runAgent] falha nao-bloqueante ao criar eval PENDENTE:",
              err,
            );
          }
        })();

        // Persistir historico de raciocinio para o proximo turno (capa interna).
        try {
          await saveConversationReasoningHistory(args.conversationId, reasoningHistory);
        } catch (err) {
          console.warn("[runAgent] Falha ao persistir reasoning_history:", err);
        }
        // Onda 1 Inteligencia (T1.16): enfileira tagging assincrono apos o
        // turno fechar. Fire-and-forget; nao bloqueia o `done` do usuario.
        void (async () => {
          try {
            const { enqueueTopicTagging } = await import(
              "@/lib/agent/intelligence/enqueue"
            );
            // Conta mensagens (cheap) para BullMQ deduplicar via jobId.
            const msgCount = await import("@/lib/prisma").then((m) =>
              m.prisma.message.count({ where: { conversationId: args.conversationId } }),
            );
            await enqueueTopicTagging(args.conversationId, msgCount);
          } catch (err) {
            console.warn("[runAgent] falha ao enfileirar tagging:", err);
          }
        })();
        args.onEvent?.({ type: "done" });
        void start;
        await Promise.allSettled(usageWrites);
        // R1 router: registra tools usadas no turno para auditoria do router.
        // Fire-and-forget , erros nao bloqueiam o retorno.
        void updateDecision(routerDecisionId, {
          toolsUsed: allTurnToolNames,
          catalogSizeOffered: filteredCatalog.tools.length,
          // RBAC v2: turno concluído com sucesso (LLM respondeu).
          outcome: "ok",
        });
        return { ok: true, message, suggestions, usage: totalUsage };
      }

      // Adiciona assistant com tool_calls
      conversation.push({
        role: "assistant",
        content: result.message,
        toolCalls: result.toolCalls,
      });

      // Persistir assistant com toolCalls. Capturamos o id da Message criada
      // para fazer UPDATE de `toolResults` apos o loop de execucao (Onda 1
      // Inteligencia, T1.7). Spec §3.2 , toolResults armazena
      // { [callId]: resultString }, fonte da verdade para o tool-replayer da
      // Frente A na Onda 2.
      const assistantMessageId = await persistAssistantMessageWithTools(
        args.conversationId,
        result.message,
        result.toolCalls,
      );
      const toolResultsMap: Record<string, string> = {};

      // Executar cada tool via MCP. Onda D do Renascimento:
      //   - Cache intra-sessao por (tool, args) com TTL 60s reduz latencia
      //     quando o agente repete a mesma chamada no mesmo loop ou turno.
      //   - Telemetria leve via console.info: tool + ms + status, util para
      //     identificar gargalos sem painel UI (que vem em proxima onda).
      const { getCachedToolResult, setCachedToolResult } = await import(
        "./session-cache"
      );
      for (const tc of result.toolCalls) {
        // RBAC v2 (SPEC §6.3): defesa em profundidade. Mesmo que o LLM chute
        // (alucine) uma tool de dominio fora do catalogo filtrado, NAO a
        // executamos , devolvemos um tool_result de erro semantico para o LLM
        // adaptar a resposta. Tools transversais (caminho3) e de prefixo
        // desconhecido passam (conservador). Esta defesa NAO gera audit_log
        // (a metrica primaria de recusa vem do fast-path da §6.2).
        const tcDomain = getToolDomain(tc.name);
        const tcTransversal =
          EXCLUDE_FROM_FILTERING.has(tcDomain) || tcDomain === UNKNOWN_DOMAIN;
        const tcAllowed =
          userAllowedDomains === "all" ||
          tcTransversal ||
          userAllowedDomains.has(tcDomain);
        if (!tcAllowed) {
          const negado = `Acesso ao domínio "${tcDomain}" não está liberado para o seu usuário.`;
          args.onEvent?.({
            type: "tool_result",
            toolName: tc.name,
            truncated: false,
            label: progressLabel(tc.name),
            toolCallId: tc.id,
          });
          conversation.push({
            role: "tool",
            toolCallId: tc.id,
            toolName: tc.name,
            content: negado,
          });
          toolResultsMap[tc.id] = negado;
          continue;
        }

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
          // Onda A2 (2026-05-26): retry exponencial em rate limit. 3 tentativas
          // com backoff 200/800/2000ms antes de declarar erro. Substitui o
          // single-shot 1500ms anterior (audit R0 mostrou 1.4% de recusa indevida
          // por rate limit + agente desistia). Total <= ~3s extra no pior caso.
          const realToolName = nomeRealDaTool.get(tc.name) ?? tc.name;
          const RATE_LIMIT_RE = /rate.?limit|too many|429|muitas requisic/i;
          const BACKOFFS = [200, 800, 2000];
          const isRateLimitStr = (s: unknown): boolean =>
            typeof s === "string" && s.length < 500 && RATE_LIMIT_RE.test(s);

          toolResultStr = "";
          for (let attempt = 0; attempt <= BACKOFFS.length; attempt++) {
            try {
              toolResultStr = await session.callTool(realToolName, toolArgs);
              if (!isRateLimitStr(toolResultStr)) break;
              if (attempt < BACKOFFS.length) {
                await new Promise((r) => setTimeout(r, BACKOFFS[attempt]!));
                continue;
              }
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (RATE_LIMIT_RE.test(msg) && attempt < BACKOFFS.length) {
                await new Promise((r) => setTimeout(r, BACKOFFS[attempt]!));
                continue;
              }
              throw err;
            }
          }
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

        // Onda 2 (2026-05-26): sanitização opcional via feature flag.
        // SANITIZE_TOOL_RESULTS=aggregates_only anexa _agregado (soma/
        // contagem/média/min/max) computado pelo código em vez de pedir
        // pro LLM calcular. Mais confiável: código é exato, LLM é
        // interpretativo. Gate de simulação validou 100% (sem quebra
        // em 306 tool results da rodada 4). Default: off.
        const { sanitizeToolResult } = await import("./quality/sanitize-tool-result");
        const sanitized = sanitizeToolResult(guarded);

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
          content: sanitized,
        });

        // Onda 1 Inteligencia (T1.7): acumular result para gravar em
        // Message.toolResults apos o loop. Persiste o SANITIZADO (o que o
        // LLM viu), pra auditoria correta no /agente/qualidade.
        toolResultsMap[tc.id] = sanitized;
      }

      // Onda 1 Inteligencia (T1.7): persiste toolResults na Message do
      // assistant que disparou as tools. UPDATE best-effort; nao bloqueia
      // o turno se falhar.
      await updateMessageToolResults(assistantMessageId, toolResultsMap);

      // Guardrail factual: acumula todos os results deste turno para
      // checagem antes do persist da mensagem final.
      allTurnToolResults.push(...Object.values(toolResultsMap));

      // Onda 1.E: tambem coleta estruturado para AutoValidator. Cada tool result
      // pode (ou nao) ter envelope canonico (campo `dados` com _RESPOSTA, etc).
      for (const tc of result.toolCalls ?? []) {
        turnToolNames.add(tc.name);
        const raw = toolResultsMap[tc.id];
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          // Tool result do MCP vem como { estado, dados, ... } ou { estado: "preparando" }
          const dados =
            parsed && typeof parsed === "object" && "dados" in parsed
              ? (parsed.dados as Record<string, unknown>)
              : (parsed as Record<string, unknown>);
          allTurnEnvelopes.push({ toolName: tc.name, dados });
        } catch {
          // resultado nao-JSON (raro); ignora pro validator
        }
        // R1 router: acumula nomes de tools chamadas no turno para auditoria
        // da decisao do router via updateDecision (fire-and-forget no final).
        allTurnToolNames.push(tc.name);
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

    // Onda 3a: trigger fire-and-forget FALHA_TECNICA pro /agente/qualidade.
    // Cria row separada do KPI normal (status=FALHA_TECNICA nao conta no
    // % CORRETO). NAO buscar lastUserMsg via query , race condition se erro
    // foi antes de persistMessage("user"). Spec §5.4.
    void (async () => {
      try {
        const { createTechnicalFailureEval } = await import("./quality/trigger");
        await createTechnicalFailureEval({
          conversationId: args.conversationId,
          userMessage: args.userMessage,
          model: resolvedLlm?.model ?? "unknown",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      } catch (innerErr) {
        console.warn("[runAgent] falha ao criar eval FALHA_TECNICA:", innerErr);
      }
    })();

    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno do agente.",
    };
  } finally {
    if (session) await session.close();
    if (externalBundle) await externalBundle.closeAll();
  }
}

/**
 * Guardrail factual: detecta valores R$ na resposta que NAO aparecem em
 * nenhum dos toolResults do turno. Cobre o padrao `dado_inventado` (12 turnos
 * ERRADO na auditoria 2026-05-26).
 *
 * Heuristica:
 * - Extrai padroes "R$ X.XXX,YY" ou "R$ X" da mensagem.
 * - Normaliza removendo pontos e virgulas para comparacao tolerante a formato.
 * - Considera "inventado" se o numero normalizado (>=3 digitos para evitar
 *   ruido de pequenos valores) nao aparece em nenhum tool result.
 */
export function findInventedValues(
  message: string,
  toolResults: string[],
): string[] {
  if (!message || toolResults.length === 0) return [];
  const haystackNoSep = toolResults.join(" ").replace(/[.,\s]/g, "");
  const invented: string[] = [];

  // Valores R$ apenas. Comparacao por PREFIXO ignorando os 2 ultimos digitos
  // (centavos) para tolerar precisao float: tool retorna 38064323.839999996,
  // agente arredonda para R$ 38.064.323,84 , comparar so 38064323 evita
  // falso positivo. R$ 0,00 e excluido (resultado valido de agregacao).
  // Extensoes para codigos/quantidades foram avaliadas e recuadas: a
  // igualdade literal nao funciona para agregados que o agente computa
  // (validacao 2026-05-26: 63% FP). A decisao de DISPARAR correcao usa
  // threshold (>=2 valores E >=50% dos R$ inventados) , implementado no
  // ponto de chamada em run-agent.ts.
  for (const m of message.matchAll(/R\$\s*([\d.,]+)/g)) {
    const raw = m[1];
    const normalized = raw.replace(/[.,\s]/g, "");
    if (normalized.length < 3) continue;
    if (/^0+$/.test(normalized)) continue;
    const withoutCents =
      normalized.length > 2 ? normalized.slice(0, -2) : normalized;
    if (withoutCents.length < 2) continue;
    if (!haystackNoSep.includes(withoutCents)) invented.push("R$ " + raw);
  }

  return Array.from(new Set(invented)).slice(0, 8);
}

/**
 * Detecta hallucination quando TODAS as tools chamadas no turno retornaram
 * vazio mas a resposta final NAO declara essa ausencia. Catch o pior caso de
 * invento (auditoria 2026-05-26 caso #8185fe09: bi_consulta_avancada retornou
 * linhas=[] e agente respondeu "405 clientes com pedido em aberto"; caso
 * #3694548f: contabil_plano_de_contas retornou estado=vazio e agente listou
 * varias contas concretas).
 */
export function detectsHallucinatedNonEmpty(
  message: string,
  toolResults: string[],
): boolean {
  if (!message || toolResults.length === 0) return false;
  const allEmpty = toolResults.every((r) => {
    if (!r) return true;
    return (
      /"estado"\s*:\s*"vazio"/i.test(r) ||
      /"linhas"\s*:\s*\[\s*\]/i.test(r) ||
      /"dados"\s*:\s*\[\s*\]/i.test(r) ||
      /"total"\s*:\s*0\b/i.test(r) ||
      /\bsem\s+(resultados?|dados|registros?|linhas?)\b/i.test(r)
    );
  });
  if (!allEmpty) return false;
  const declaresEmpty =
    /n[ãa]o\s+(encontr|h[áa]\s|consta|consegui|tem\s|temos|existe)/i.test(
      message,
    ) ||
    /sem\s+(resultados?|registros?|dados|linhas?)/i.test(message) ||
    /\bvazi[oa]\b/i.test(message) ||
    /nenhum/i.test(message) ||
    /\b0\s+(registros?|resultados?|itens?|linhas?|pedidos?|clientes?|produtos?)/i.test(
      message,
    ) ||
    /retornou\s+vazi/i.test(message);
  return !declaresEmpty;
}
