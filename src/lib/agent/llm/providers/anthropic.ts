/**
 * Adapter HTTP para a API da Anthropic (Claude).
 *
 * Portado de nexus-insights/src/lib/llm/providers/anthropic.ts.
 * Adaptações: usa calculateCost do catalog.ts unificado.
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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: object;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export function isMockKey(apiKey: string): boolean {
  return !apiKey || apiKey.trim() === "" || apiKey.startsWith("MOCK");
}

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: unknown;
}

function mapMessages(messages: ChatMessage[]): {
  system?: string;
  messages: AnthropicMessageParam[];
} {
  let system: string | undefined;
  const out: AnthropicMessageParam[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      // Multi-system: concatenar com separador duplo
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === "tool") {
      // Anthropic representa tool result como content block dentro de role=user
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        out.push({ role: "assistant", content: blocks });
      } else {
        out.push({ role: "assistant", content: m.content });
      }
      continue;
    }
    // role === "user"
    out.push({ role: "user", content: m.content });
  }

  return { system, messages: out };
}

function mapTools(tools?: ToolDefinition[]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export class AnthropicClient implements ProviderClient {
  readonly provider = "anthropic" as const;

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
          "[MOCK Anthropic] Resposta simulada — configure a API key para respostas reais.",
        usage: {
          tokensInput,
          tokensOutput,
          costUsd: costUsd ?? 0,
        },
      };
    }

    const { system, messages } = mapMessages(request.messages);
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? 1024,
    };
    if (system) body.system = system;
    if (typeof request.temperature === "number") {
      body.temperature = request.temperature;
    }
    const tools = mapTools(request.tools);
    if (tools) body.tools = tools;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    let messageText = "";
    const toolCalls: ToolCall[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        messageText += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    const tokensInput = data.usage?.input_tokens ?? 0;
    const tokensOutput = data.usage?.output_tokens ?? 0;
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    return {
      message: messageText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        tokensInput,
        tokensOutput,
        costUsd: costUsd ?? 0,
      },
    };
  }
}
