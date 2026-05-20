/**
 * Tipos compartilhados pela infraestrutura de LLM (multi-provider).
 *
 * Os adapters concretos (OpenAI, Anthropic, Gemini, OpenRouter) implementam
 * `ProviderClient` e expõem `chat()` com a forma canônica de mensagens, tools
 * e usage. Não dependem de SDKs externos — usam `fetch` direto.
 *
 * Portado de nexus-insights/src/lib/llm/types.ts para o agente nexus-odoo (F5).
 */

export type LlmProvider = "openai" | "anthropic" | "gemini" | "openrouter";

/**
 * Faixa de custo (4 tiers):
 *  - low    → < $1 / 1M tokens
 *  - medium → $1 a $10 / 1M tokens
 *  - high   → $10 a $30 / 1M tokens
 *  - premium→ > $30 / 1M tokens
 */
export type CostTier = "low" | "medium" | "high" | "premium";

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
  /** Presente quando role === "tool" — referencia a tool call original. */
  toolCallId?: string;
  /** Nome da tool (role === "tool"). */
  toolName?: string;
}

export interface ChatUsage {
  tokensInput: number;
  tokensOutput: number;
  /** Custo em USD (pode ser 0 quando costKnown=false — ver LlmUsage). */
  costUsd: number;
}

export interface ChatResult {
  /** Texto retornado pelo modelo (vazio se só houve toolCalls). */
  message: string;
  /** Tool calls solicitadas pelo modelo, se houver. */
  toolCalls?: ToolCall[];
  usage: ChatUsage;
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
}

export interface ProviderClient {
  provider: LlmProvider;
  model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}
