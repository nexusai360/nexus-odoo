/**
 * Tipos compartilhados pela infraestrutura de LLM (multi-provider).
 *
 * Os adapters concretos (OpenAI, Anthropic, Gemini, OpenRouter) implementam
 * `ProviderClient` e expõem `chat()` com a forma canônica de mensagens, tools
 * e usage. Não dependem de SDKs externos , usam `fetch` direto.
 *
 * Portado de nexus-insights/src/lib/llm/types.ts para o agente nexus-odoo (F5).
 */

export type LlmProvider = "openai" | "anthropic" | "gemini" | "openrouter";

/**
 * Faixa de custo (5 tiers):
 *  - free   → modelos gratuitos (ex.: OpenRouter `:free`)
 *  - low    → < $1 / 1M tokens
 *  - medium → $1 a $10 / 1M tokens
 *  - high   → $10 a $30 / 1M tokens
 *  - premium→ > $30 / 1M tokens
 */
export type CostTier = "free" | "low" | "medium" | "high" | "premium";

/** Definição de tool/function exposta para o modelo. */
export interface ToolDefinition {
  /** Nome da função/tool exposta para o modelo. */
  name: string;
  /** Descrição livre do que a tool faz (usada pelo modelo para escolher). */
  description: string;
  /** JSON Schema dos parâmetros aceitos pela tool. */
  parameters: object;
}

export interface ToolCall {
  /** ID único da chamada (gerado pelo provider). */
  id: string;
  /** Nome da tool requisitada. */
  name: string;
  /** Argumentos JSON parseados (objeto). */
  arguments: object;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Presente quando role === "assistant" e o modelo solicitou tool calls. */
  toolCalls?: ToolCall[];
  /** Presente quando role === "tool" , referencia a tool call original. */
  toolCallId?: string;
  /** Nome da tool (role === "tool"). */
  toolName?: string;
}

export interface ChatUsage {
  tokensInput: number;
  tokensOutput: number;
  /** Custo em USD (pode ser 0 quando costKnown=false , ver LlmUsage). */
  costUsd: number;
}

export interface ChatResult {
  /** Texto retornado pelo modelo (vazio se só houve toolCalls). */
  message: string;
  /** Tool calls solicitadas pelo modelo, se houver. */
  toolCalls?: ToolCall[];
  usage: ChatUsage;
  /**
   * Tokens consumidos no raciocínio interno. Subset conceitual de
   * `usage.tokensOutput` (OpenAI inclui na fatura; gravamos separado para
   * auditoria). `undefined` quando o provider não expõe (ex.: Anthropic).
   */
  reasoningTokens?: number;
  /**
   * Contexto de raciocínio deste turno, para `run-agent` empilhar em
   * `reasoningHistory`. `undefined` quando reasoning está off ou quando o
   * provider não produziu blocos preserváveis.
   */
  reasoningContext?: ReasoningContext;
  /**
   * `true` quando o adapter emitiu pelo menos um `onToken` durante o
   * parse (streaming SSE real). Consumidor (bolha do Nex) usa para decidir
   * entre typewriter frontend (ausente/false) e exibição direta (true).
   * Opcional na transição da Onda 1; cada adapter define ao migrar para
   * streaming nas Ondas 3-6.
   */
  streamed?: boolean;
}

/**
 * Profundidade de raciocínio para modelos reasoning.
 *
 * - "auto": modelo decide internamente (Anthropic adaptive, Gemini thinkingBudget=-1).
 *   UI exibe "Modelo define automaticamente" e dropdown fica disabled.
 * - "minimal" | "low" | "medium" | "high": teto explícito.
 *
 * O adapter consulta `reasoningCapsOf(modelId).levels` para decidir o que
 * é aceito; valor fora dos levels do modelo é remapeado ou ignorado.
 */
export type ReasoningEffort = "auto" | "minimal" | "low" | "medium" | "high";

/**
 * Estado opaco de raciocínio de um turno anterior. Cada adapter define seu
 * `data` shape internamente; `run-agent.ts` trata como caixa preta (recebe,
 * acumula, repassa). Persistido em `conversations.reasoning_history` JSONB.
 */
export interface ReasoningContext {
  provider: LlmProvider;
  data: unknown;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** 0..2 (cada provider mapeia internamente). */
  temperature?: number;
  /** Limite máximo de tokens de output. */
  maxTokens?: number;
  /** Quando true, o adapter deve fazer streaming token-a-token (se suportado). */
  stream?: boolean;
  /** Callback invocado para cada token delta durante streaming. */
  onToken?: (token: string) => void;
  /**
   * Profundidade de raciocínio (modelos reasoning). Quando ausente, o provider
   * usa seu default.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * Override do mapping effort→budget para Anthropic budget_tokens, Gemini
   * thinkingBudget e OpenRouter reasoning.max_tokens. Quando ausente, o
   * adapter usa `effortToBudget(modelId, effort)` do catálogo.
   */
  reasoningMaxTokens?: number;
  /**
   * Histórico de contextos de raciocínio das iterações anteriores da MESMA
   * conversa. Crescente. Capado em 20 iterações ou 50KB serialized. Adapter
   * faz cast de `data` interno e injeta no próximo request conforme o
   * formato exigido pelo provider.
   */
  reasoningHistory?: ReasoningContext[];
}

export interface ProviderClient {
  provider: LlmProvider;
  model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}
