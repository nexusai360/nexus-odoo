/**
 * Adapter HTTP para a API da OpenAI (GPT-4/5, o1/o3).
 *
 * Portado de nexus-insights/src/lib/llm/providers/openai.ts.
 * Modelos reasoning (GPT-5.x, o1/o3/o4) usam max_completion_tokens e
 * não aceitam temperature customizada.
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

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * Modelos que SO funcionam via /v1/responses (a "Pro/Deep Reasoning" family
 * da OpenAI). Lista heuristica por padroes de id; cobre gpt-5.x-pro, o1-pro,
 * o3-pro, etc.
 */
function requiresResponsesApi(model: string): boolean {
  return /-pro(-|$)|^o[1-9]-pro$|^gpt-5(\.[0-9]+)?-pro/.test(model);
}

interface OpenAIToolCallRaw {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCallRaw[];
  };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function isMockKey(apiKey: string): boolean {
  return !apiKey || apiKey.trim() === "" || apiKey.startsWith("MOCK");
}

/** Modelos de raciocínio da OpenAI usam max_completion_tokens e não aceitam temperature. */
export function isReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith("gpt-5") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}

function mapMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
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
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export class OpenAIClient implements ProviderClient {
  readonly provider = "openai" as const;

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
          "[MOCK OpenAI] Resposta simulada , configure a API key para respostas reais.",
        usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      };
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(request.messages),
    };
    const tools = mapTools(request.tools);
    if (tools) body.tools = tools;

    const reasoning = isReasoningModel(this.model);
    if (reasoning && request.reasoningEffort) {
      // Duas incompatibilidades do gpt-5.4-nano em /v1/chat/completions:
      //   1) rejeita "minimal" ("Supported values: none|low|medium|high|xhigh"
      //      no nano).
      //   2) rejeita reasoning_effort quando há function tools ("Function tools
      //      with reasoning_effort are not supported for gpt-5.4-nano in
      //      /v1/chat/completions. Please use /v1/responses").
      // Como o agente sempre carrega o catálogo MCP como tools, o nano não
      // aceita o parâmetro. Estratégia: só envia reasoning_effort quando NÃO
      // há tools (e mapeia "minimal" → "low" para a família 5.x).
      const noTools = !tools || tools.length === 0;
      if (noTools) {
        body.reasoning_effort =
          request.reasoningEffort === "minimal"
            ? "low"
            : request.reasoningEffort;
      }
    }
    if (typeof request.temperature === "number" && !reasoning) {
      body.temperature = request.temperature;
    }
    if (typeof request.maxTokens === "number") {
      if (reasoning) {
        body.max_completion_tokens = request.maxTokens;
      } else {
        body.max_tokens = request.maxTokens;
      }
    }

    // Modelos pro/deep-reasoning (gpt-5.5-pro, o1-pro, etc) usam /v1/responses.
    if (requiresResponsesApi(this.model)) {
      return await this.chatViaResponses(request);
    }

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const choice = data.choices?.[0];
    if (!choice) throw new Error("OpenAI: resposta sem choices");

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

  /**
   * Variante para /v1/responses (modelos pro/deep-reasoning).
   * Schema diferente do chat completions: input vira array de items
   * tipados (message, function_call, function_call_output); tools sao
   * declaradas com type: function direto (sem wrapping); output volta
   * em items tipados que sao parseados de volta para ChatResult.
   */
  private async chatViaResponses(request: ChatRequest): Promise<ChatResult> {
    const reasoning = isReasoningModel(this.model);
    const input = mapMessagesToResponsesInput(request.messages);
    const respBody: Record<string, unknown> = {
      model: this.model,
      input,
    };
    const respTools = mapToolsToResponses(request.tools);
    if (respTools) respBody.tools = respTools;
    if (reasoning && request.reasoningEffort) {
      respBody.reasoning = {
        effort:
          request.reasoningEffort === "minimal" ? "low" : request.reasoningEffort,
      };
    }
    if (typeof request.maxTokens === "number") {
      respBody.max_output_tokens = request.maxTokens;
    }
    const rRes = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(respBody),
    });
    if (!rRes.ok) {
      const text = await rRes.text().catch(() => "");
      throw new Error(`OpenAI Responses ${rRes.status}: ${text || rRes.statusText}`);
    }
    const rData = (await rRes.json()) as {
      output?: Array<{
        type?: string;
        content?: Array<{ text?: string; type?: string }>;
        call_id?: string;
        name?: string;
        arguments?: string;
      }>;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    let text = rData.output_text ?? "";
    const toolCalls: ToolCall[] = [];
    for (const item of rData.output ?? []) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && typeof c.text === "string") {
            text += c.text;
          }
        }
      } else if (item.type === "function_call" && item.call_id && item.name) {
        let args: object = {};
        try {
          args = item.arguments ? (JSON.parse(item.arguments) as object) : {};
        } catch {
          args = { _raw: item.arguments };
        }
        toolCalls.push({ id: item.call_id, name: item.name, arguments: args });
      }
    }
    const tIn = rData.usage?.input_tokens ?? 0;
    const tOut = rData.usage?.output_tokens ?? 0;
    const { costUsd } = calculateCost(this.model, tIn, tOut);
    return {
      message: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput: tIn, tokensOutput: tOut, costUsd: costUsd ?? 0 },
    };
  }
}

/** Converte ChatMessage[] em items do /v1/responses input schema. */
function mapMessagesToResponsesInput(messages: ChatMessage[]): unknown[] {
  const items: unknown[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: m.toolCallId,
        output: m.content,
      });
    } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      if (m.content) {
        items.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
        });
      }
      for (const tc of m.toolCalls) {
        items.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        });
      }
    } else {
      items.push({
        type: "message",
        role: m.role,
        content: [
          {
            type: m.role === "assistant" ? "output_text" : "input_text",
            text: m.content,
          },
        ],
      });
    }
  }
  return items;
}

/** Converte ToolDefinition[] em tools do /v1/responses (sem wrapping function). */
function mapToolsToResponses(tools?: ToolDefinition[]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}
