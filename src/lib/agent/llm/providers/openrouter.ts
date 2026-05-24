/**
 * Adapter HTTP para o OpenRouter (proxy multi-provider).
 *
 * Portado de nexus-insights/src/lib/llm/providers/openrouter.ts.
 * Remove o prefixo "openrouter/" do model id antes de enviar para a API.
 */

import { calculateCost } from "../catalog";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ProviderClient,
  ToolCall,
  ToolDefinition,
} from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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
  choices: OpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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

    const body: Record<string, unknown> = {
      model: normalizeModelForApi(this.model),
      messages: mapMessages(request.messages),
    };
    const tools = mapTools(request.tools);
    if (tools) body.tools = tools;
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;

    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nexus-odoo.local",
        "X-Title": "Nexus Odoo Agente",
      },
      body: JSON.stringify(body),
    });

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
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    return {
      message: choice.message.content ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
    };
  }
}
