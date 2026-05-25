/**
 * Adapter HTTP para a API da Anthropic (Claude).
 *
 * Portado de nexus-insights/src/lib/llm/providers/anthropic.ts.
 * Adaptações: usa calculateCost do catalog.ts unificado.
 */

import { calculateCost, effortToBudget, reasoningCapsOf } from "../catalog";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ProviderClient,
  ReasoningContext,
  ToolCall,
  ToolDefinition,
} from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const INTERLEAVED_BETA = "interleaved-thinking-2025-05-14";
const DEFAULT_TIMEOUT_MS = 120_000;

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
          "[MOCK Anthropic] Resposta simulada , configure a API key para respostas reais.",
        usage: {
          tokensInput,
          tokensOutput,
          costUsd: costUsd ?? 0,
        },
      };
    }

    const cap = reasoningCapsOf(this.model);
    const { system, messages } = mapMessages(request.messages);

    // Onda 4: multi-turn injetando blocos thinking+tool_use do reasoningHistory.
    const messagesWithHistory = injectAnthropicHistory(messages, request.reasoningHistory);

    const tools = mapTools(request.tools);
    const hasTools = !!tools && tools.length > 0;

    // Calcular budget de thinking baseado no cap + effort.
    const wantsThinking =
      request.reasoningEffort && cap && cap.enabled && cap.supportsWithTools;
    const budgetTokens = wantsThinking
      ? request.reasoningMaxTokens ?? effortToBudget(this.model, request.reasoningEffort!) ?? null
      : null;

    // max_tokens deve ser > budget_tokens; clampar ao outputCap do modelo.
    const baseMaxTokens = request.maxTokens ?? 1024;
    let maxTokens = baseMaxTokens;
    if (budgetTokens) {
      maxTokens = budgetTokens + baseMaxTokens;
      if (cap?.outputCap && maxTokens > cap.outputCap) {
        maxTokens = cap.outputCap;
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messagesWithHistory,
      max_tokens: maxTokens,
    };
    if (system) body.system = system;
    // Temperatura: Anthropic exige temperature=1 quando thinking esta ativo.
    if (wantsThinking) {
      body.temperature = 1;
    } else if (typeof request.temperature === "number") {
      body.temperature = request.temperature;
    }
    if (tools) body.tools = tools;

    // Bloco thinking: adaptiveMode (4.6+) usa type:"adaptive"; demais "enabled".
    if (wantsThinking && budgetTokens) {
      body.thinking = {
        type: cap!.anthropicThinking === "adaptive" ? "adaptive" : "enabled",
        budget_tokens: budgetTokens,
        display: "summarized",
      };
    }

    // Streaming habilitado quando solicitado, inclusive quando há tools.
    // A API Anthropic suporta SSE com tool_use , os blocos tool_use chegam
    // via content_block_start/content_block_delta e são parseados em #parseStream.
    const useStream = request.stream === true && !!request.onToken;

    if (useStream) {
      body.stream = true;
    }

    // Beta header para interleaved thinking nos modelos 4.5 que precisam.
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    };
    if (
      wantsThinking
      && hasTools
      && cap?.anthropicInterleavedAuto === false
      && cap.supportsWithTools
    ) {
      headers["anthropic-beta"] = INTERLEAVED_BETA;
    }

    const timeoutMs = cap?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Anthropic timeout apos ${timeoutMs}ms`);
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`);
    }

    if (useStream) {
      return this.#parseStream(res, request.onToken);
    }

    const data = (await res.json()) as AnthropicResponse;
    let messageText = "";
    const toolCalls: ToolCall[] = [];
    // Blocos preservaveis para o proximo turno (thinking, redacted_thinking, tool_use).
    const reasoningBlocks: unknown[] = [];
    for (const block of data.content ?? []) {
      const b = block as { type?: string; text?: string; id?: string; name?: string; input?: object };
      if (b.type === "text") {
        messageText += b.text ?? "";
      } else if (b.type === "tool_use") {
        toolCalls.push({
          id: b.id ?? "",
          name: b.name ?? "",
          arguments: b.input ?? {},
        });
        reasoningBlocks.push(block);
      } else if (b.type === "thinking" || b.type === "redacted_thinking") {
        reasoningBlocks.push(block);
      }
    }

    const tokensInput = data.usage?.input_tokens ?? 0;
    const tokensOutput = data.usage?.output_tokens ?? 0;
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    const reasoningContext: ReasoningContext | undefined =
      reasoningBlocks.length > 0
        ? { provider: "anthropic", data: { blocks: reasoningBlocks } }
        : undefined;

    return {
      message: messageText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        tokensInput,
        tokensOutput,
        costUsd: costUsd ?? 0,
      },
      // Anthropic nao expoe reasoning_tokens separado; logger grava NULL.
      reasoningTokens: undefined,
      reasoningContext,
      streamed: false,
    };
  }

  /**
   * Consome a response SSE do Anthropic streaming e retorna ChatResult.
   * Parseia:
   * - `message_start` → input tokens
   * - `content_block_start` → identifica blocos tool_use (captura id/name)
   * - `content_block_delta` → text_delta (texto) ou input_json_delta (args tool)
   * - `message_delta` → output tokens + stop_reason
   */
  async #parseStream(
    res: Response,
    onToken?: (token: string) => void,
  ): Promise<ChatResult> {
    if (!res.body) throw new Error("Anthropic stream: response.body é null");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let messageText = "";
    let tokensInput = 0;
    let tokensOutput = 0;
    let buf = "";

    // Estado para blocos tool_use
    const toolCallMap: Record<number, { id: string; name: string; jsonBuf: string }> = {};
    let currentBlockIndex = -1;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;

          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (evt.type === "message_start") {
            const msg = evt.message as { usage?: { input_tokens?: number } } | undefined;
            tokensInput = msg?.usage?.input_tokens ?? 0;
          } else if (evt.type === "content_block_start") {
            const index = evt.index as number ?? 0;
            const block = evt.content_block as { type?: string; id?: string; name?: string } | undefined;
            currentBlockIndex = index;
            if (block?.type === "tool_use") {
              toolCallMap[index] = { id: block.id ?? "", name: block.name ?? "", jsonBuf: "" };
            }
          } else if (evt.type === "content_block_delta") {
            const index = (evt.index as number | undefined) ?? currentBlockIndex;
            const delta = evt.delta as { type?: string; text?: string; partial_json?: string } | undefined;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              messageText += delta.text;
              onToken?.(delta.text);
            } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
              if (toolCallMap[index]) {
                toolCallMap[index].jsonBuf += delta.partial_json;
              }
            }
          } else if (evt.type === "message_delta") {
            const usage = (evt as { usage?: { output_tokens?: number } }).usage;
            tokensOutput = usage?.output_tokens ?? 0;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Montar tool calls a partir dos blocos acumulados
    const toolCalls: ToolCall[] = Object.entries(toolCallMap).map(([, tc]) => {
      let args: object = {};
      try { args = JSON.parse(tc.jsonBuf) as object; } catch { /* args permanece {} */ }
      return { id: tc.id, name: tc.name, arguments: args };
    });

    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput);

    return {
      message: messageText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput, tokensOutput, costUsd: costUsd ?? 0 },
      reasoningTokens: undefined,
      streamed: true,
    };
  }
}

/**
 * Injeta blocos opacos do reasoningHistory (Anthropic-only) como mensagens
 * assistant intermediarias. Cada item de history vira uma mensagem assistant
 * com os blocks preservados (thinking + tool_use). Inserido apos a primeira
 * mensagem user e antes do tool_result correspondente.
 *
 * Simplificacao: aplica linearmente ao FINAL da conversa, antes da ultima
 * mensagem (que normalmente eh um tool_result ou nova pergunta). Para
 * conversas longas com varias iteracoes, o run-agent ja monta a sequencia
 * correta via reasoningHistory crescente.
 */
function injectAnthropicHistory(
  messages: Array<{ role: "user" | "assistant"; content: unknown }>,
  history: ReasoningContext[] | undefined,
): Array<{ role: "user" | "assistant"; content: unknown }> {
  if (!history || history.length === 0) return messages;
  const blocks: unknown[] = [];
  for (const ctx of history) {
    if (ctx.provider !== "anthropic") continue;
    const data = ctx.data as { blocks?: unknown[] } | null;
    if (data?.blocks && Array.isArray(data.blocks)) {
      blocks.push(...data.blocks);
    }
  }
  if (blocks.length === 0) return messages;
  // Inserir como mensagem assistant antes da ultima mensagem.
  if (messages.length === 0) return messages;
  return [
    ...messages.slice(0, -1),
    { role: "assistant", content: blocks },
    messages[messages.length - 1],
  ];
}
