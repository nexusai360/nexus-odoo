/**
 * Adapter HTTP para o OpenRouter (proxy multi-provider).
 *
 * Portado de nexus-insights/src/lib/llm/providers/openrouter.ts.
 * Remove o prefixo "openrouter/" do model id antes de enviar para a API.
 */

import { calculateCost, effortToBudget, reasoningCapsOf } from "../catalog";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ProviderClient,
  ReasoningContext,
  ReasoningEffort,
  ToolCall,
  ToolDefinition,
} from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 120_000;

function mapEffortForOpenRouter(effort: ReasoningEffort): "minimal" | "low" | "medium" | "high" {
  if (effort === "auto") return "high";
  return effort;
}

interface OpenRouterToolCallRaw {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenRouterToolCallRaw[];
  };
  finish_reason: string;
}

interface OpenRouterResponse {
  choices: Array<
    OpenRouterChoice & {
      message: {
        role: string;
        content: string | null;
        reasoning?: string;
        reasoning_details?: unknown[];
        tool_calls?: OpenRouterToolCallRaw[];
      };
    }
  >;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

export function isMockKey(apiKey: string): boolean {
  return !apiKey || apiKey.trim() === "" || apiKey.startsWith("MOCK");
}

/** Remove o prefixo "openrouter/" do model id antes de enviar para a API. */
function normalizeModelForApi(model: string): string {
  return model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
}

function mapMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function mapTools(tools?: ToolDefinition[]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OpenRouterClient implements ProviderClient {
  readonly provider = "openrouter" as const;

  constructor(
    private readonly apiKey: string,
    public readonly model: string,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResult> {
    if (isMockKey(this.apiKey)) {
      const tokensInput = 100;
      const tokensOutput = 50;
      const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);
      return {
        message:
          "[MOCK OpenRouter] Resposta simulada , configure a API key para respostas reais.",
        usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      };
    }

    const cap = reasoningCapsOf(this.model);
    const messagesWithHistory = injectOpenRouterHistory(
      mapMessages(request.messages),
      request.reasoningHistory,
    );

    const body: Record<string, unknown> = {
      model: normalizeModelForApi(this.model),
      messages: messagesWithHistory,
    };
    const tools = mapTools(request.tools);
    if (tools) body.tools = tools;
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;

    // Onda 6: reasoning unificado.
    if (request.reasoningEffort && cap && cap.enabled && cap.supportsWithTools) {
      if (cap.openrouterShape === "effort" || cap.adaptiveMode) {
        body.reasoning = {
          effort: mapEffortForOpenRouter(request.reasoningEffort),
          exclude: false,
        };
      } else if (cap.openrouterShape === "max_tokens") {
        const budget =
          request.reasoningMaxTokens
          ?? effortToBudget(this.model, request.reasoningEffort)
          ?? 8192;
        body.reasoning = { max_tokens: budget, exclude: false };
      }
    }

    const timeoutMs = cap?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    let res: Response;
    try {
      res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nexus-odoo.local",
          "X-Title": "Nexus Odoo Agente",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`OpenRouter timeout apos ${timeoutMs}ms`);
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const choice = data.choices?.[0];
    if (!choice) throw new Error("OpenRouter: resposta sem choices");

    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map((tc) => {
      let parsed: object = {};
      try {
        parsed = tc.function.arguments ? (JSON.parse(tc.function.arguments) as object) : {};
      } catch {
        parsed = { _raw: tc.function.arguments };
      }
      return { id: tc.id, name: tc.function.name, arguments: parsed };
    });

    const tokensInput = data.usage?.prompt_tokens ?? 0;
    const tokensOutput = data.usage?.completion_tokens ?? 0;
    const reasoningTokens = data.usage?.reasoning_tokens;
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    const reasoningDetails = choice.message.reasoning_details;
    const reasoningContext: ReasoningContext | undefined =
      Array.isArray(reasoningDetails) && reasoningDetails.length > 0
        ? { provider: "openrouter", data: { details: reasoningDetails } }
        : undefined;

    return {
      message: choice.message.content ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      reasoningTokens: typeof reasoningTokens === "number" ? reasoningTokens : undefined,
      reasoningContext,
      streamed: false,
    };
  }
}

/**
 * Injeta reasoning_details opacos do reasoningHistory (OpenRouter-only) na
 * mensagem assistant intermediaria. Caso a API rejeite o campo, a inclusao
 * eh silenciosamente ignorada pelo gateway (best-effort). Inserido apos a
 * primeira user message e antes da ultima.
 */
function injectOpenRouterHistory(
  messages: unknown[],
  history: ReasoningContext[] | undefined,
): unknown[] {
  if (!history || history.length === 0) return messages;
  const allDetails: unknown[] = [];
  for (const ctx of history) {
    if (ctx.provider !== "openrouter") continue;
    const data = ctx.data as { details?: unknown[] } | null;
    if (data?.details && Array.isArray(data.details)) {
      allDetails.push(...data.details);
    }
  }
  if (allDetails.length === 0) return messages;
  // Adicionar como mensagem assistant intermediaria antes da ultima.
  if (messages.length === 0) return messages;
  return [
    ...messages.slice(0, -1),
    { role: "assistant", content: null, reasoning_details: allDetails },
    messages[messages.length - 1],
  ];
}
