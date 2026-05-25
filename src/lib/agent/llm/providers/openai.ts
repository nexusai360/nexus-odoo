/**
 * Adapter HTTP para a API da OpenAI (GPT-4/5, o1/o3).
 *
 * Portado de nexus-insights/src/lib/llm/providers/openai.ts.
 * Modelos reasoning (GPT-5.x, o1/o3/o4) usam max_completion_tokens e
 * não aceitam temperature customizada.
 */

import { calculateCost, reasoningCapsOf } from "../catalog";
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

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Default 90s; override por modelo via cap.requestTimeoutMs. */
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Onda 3 da modernizacao: a fonte da verdade do roteamento eh REASONING_CAPS.
 * Modelo com cap.openaiEndpoint === "responses" vai para /v1/responses;
 * caso contrario, cai para /v1/chat/completions (compat para modelos sem
 * reasoning, ex.: gpt-4o se algum dia precisar).
 *
 * O regex `requiresResponsesApi` antigo eh substituido por esta consulta;
 * mantemos a funcao apenas como helper legado para ajuste fino se aparecer
 * modelo nao catalogado seguindo o naming `-pro`.
 */
function requiresResponsesApi(model: string): boolean {
  const cap = reasoningCapsOf(model);
  if (cap?.openaiEndpoint === "responses") return true;
  // Fallback heuristico para modelos sem cap catalogado.
  return /-pro(-|$)|^o[1-9]-pro$|^gpt-5(\.[0-9]+)?-pro/.test(model);
}

/**
 * Mapeia "minimal" -> "low" para modelos cujo cap.levels nao inclui "minimal"
 * (ex.: o3, o1, gpt-5.4-pro). Caso contrario passa o effort literalmente.
 * "auto" eh sinal interno: mapeia para "medium" (OpenAI nao tem auto nativo).
 */
function resolveOpenAiEffort(
  model: string,
  effort: ReasoningEffort,
): "low" | "medium" | "high" | "minimal" | "xhigh" {
  if (effort === "auto") return "medium";
  const cap = reasoningCapsOf(model);
  if (effort === "minimal" && cap && !cap.levels.includes("minimal")) {
    return "low";
  }
  return effort;
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
      // Branch chat-completions: usado apenas como fallback para modelos sem
      // cap.openaiEndpoint="responses". Onda 3 da modernizacao tirou a trava
      // de "noTools" porque a unica famila que rejeitava (gpt-5.x-nano) agora
      // roteia pela Responses API (cap.openaiEndpoint="responses").
      body.reasoning_effort = resolveOpenAiEffort(this.model, request.reasoningEffort);
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
   * /v1/responses canonica (Onda 3 da modernizacao). Aplicado para todos os
   * modelos com cap.openaiEndpoint="responses" - isso cobre gpt-5.x (nano,
   * mini, std, pro), gpt-5.5, o1, o3, codex e variantes. Schema:
   *   - `instructions`: system prompt como string (nao mensagem).
   *   - `input[]`: items tipados (message, reasoning, function_call,
   *     function_call_output) na ordem do turno.
   *   - `tools[]`: type:"function" direto.
   *   - `reasoning`: { effort, summary }.
   *   - `store: false`: stateless.
   *   - `max_output_tokens` opcional.
   * Resposta inclui `output[]` typed items e `usage.output_tokens_details.reasoning_tokens`.
   */
  private async chatViaResponses(request: ChatRequest): Promise<ChatResult> {
    const reasoning = isReasoningModel(this.model);
    const cap = reasoningCapsOf(this.model);

    // Separa role:"system" do array para virar `instructions` string.
    const { instructions, restMessages } = extractInstructions(request.messages);

    // Multi-turn: items de reasoningHistory (preservados do turno anterior)
    // vao DEPOIS da mensagem do usuario, antes dos items deste turno.
    const historyItems = collectHistoryItems(request.reasoningHistory);
    const input = mapMessagesToResponsesInput(restMessages);
    // Insercao: localiza ultima mensagem user e injeta historyItems apos.
    const inputWithHistory = injectHistoryAfterLastUser(input, historyItems);

    const respBody: Record<string, unknown> = {
      model: this.model,
      input: inputWithHistory,
      store: false,
    };
    if (instructions) {
      respBody.instructions = instructions;
    }
    const respTools = mapToolsToResponses(request.tools);
    if (respTools) respBody.tools = respTools;
    if (reasoning && request.reasoningEffort) {
      respBody.reasoning = {
        effort: resolveOpenAiEffort(this.model, request.reasoningEffort),
        summary: "auto",
      };
    }
    if (typeof request.maxTokens === "number") {
      respBody.max_output_tokens = request.maxTokens;
    }

    const timeoutMs = cap?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    let rRes: Response;
    try {
      rRes = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(respBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`OpenAI Responses timeout apos ${timeoutMs}ms`);
      }
      throw err;
    }

    if (!rRes.ok) {
      const text = await rRes.text().catch(() => "");
      throw new Error(`OpenAI Responses ${rRes.status}: ${text || rRes.statusText}`);
    }
    const rData = (await rRes.json()) as {
      output?: Array<{
        type?: string;
        id?: string;
        content?: Array<{ text?: string; type?: string }>;
        call_id?: string;
        name?: string;
        arguments?: string;
        summary?: unknown;
      }>;
      output_text?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        output_tokens_details?: { reasoning_tokens?: number };
      };
    };

    let text = rData.output_text ?? "";
    const toolCalls: ToolCall[] = [];
    // Items a preservar como contexto opaco para o proximo turno: reasoning
    // (com summary) e function_call. function_call_output eh adicionado pelo
    // run-agent apos executar a tool (nao volta na resposta deste turno).
    //
    // CRITICO: com store:false, a OpenAI NAO persiste os items entre chamadas.
    // Se reenviarmos com o campo `id` (que eh referencia ao state), a API
    // retorna 404 "Item with id X not found. Items are not persisted when
    // store is set to false". Solucao: strippar o `id` dos reasoning items
    // antes de salvar no contexto. function_call mantem `call_id` (que eh
    // necessario para parear com function_call_output, nao depende de state).
    const reasoningItems: unknown[] = [];
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
        // Preservar function_call mantendo call_id mas removendo `id` interno.
        const { id: _fcId, ...fcWithoutInternalId } = item;
        void _fcId;
        reasoningItems.push(fcWithoutInternalId);
      } else if (item.type === "reasoning") {
        // Remove `id` (referencia a state nao-persistido) e preserva summary/content.
        const { id: _rsId, ...rsWithoutId } = item;
        void _rsId;
        reasoningItems.push(rsWithoutId);
      }
    }

    const tIn = rData.usage?.input_tokens ?? 0;
    const tOut = rData.usage?.output_tokens ?? 0;
    const rTokens = rData.usage?.output_tokens_details?.reasoning_tokens;
    const { costUsd } = calculateCost(this.model, tIn, tOut);

    const reasoningContext: ReasoningContext | undefined =
      reasoningItems.length > 0
        ? { provider: "openai", data: { items: reasoningItems } }
        : undefined;

    return {
      message: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput: tIn, tokensOutput: tOut, costUsd: costUsd ?? 0 },
      reasoningTokens: typeof rTokens === "number" ? rTokens : undefined,
      reasoningContext,
      streamed: false,
    };
  }
}

/** Extrai o conteudo de role:"system" para o campo `instructions` da Responses API. */
function extractInstructions(messages: ChatMessage[]): {
  instructions: string;
  restMessages: ChatMessage[];
} {
  const systemTexts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(m.content);
    } else {
      rest.push(m);
    }
  }
  return {
    instructions: systemTexts.join("\n\n"),
    restMessages: rest,
  };
}

/** Coleta items opacos de reasoningHistory pertencentes ao provider OpenAI.
 * Defensive: strippa `id` de reasoning items (compat com history antigo que
 * pode ter sido gravado antes do fix de store:false). */
function collectHistoryItems(history: ReasoningContext[] | undefined): unknown[] {
  if (!history) return [];
  const items: unknown[] = [];
  for (const ctx of history) {
    if (ctx.provider !== "openai") continue;
    const data = ctx.data as { items?: unknown[] } | null;
    if (data?.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        items.push(stripOpenAiItemId(item));
      }
    }
  }
  return items;
}

/** Remove `id` interno (mantem call_id) para compat com store:false. */
function stripOpenAiItemId(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const obj = item as Record<string, unknown>;
  if (obj.type === "reasoning" || obj.type === "function_call") {
    const { id: _id, ...rest } = obj;
    void _id;
    return rest;
  }
  return item;
}

/** Insere historico de raciocinio apos a ultima mensagem user no input. */
function injectHistoryAfterLastUser(
  input: unknown[],
  history: unknown[],
): unknown[] {
  if (history.length === 0) return input;
  // Acha o ultimo indice de mensagem com role:"user".
  let lastUserIdx = -1;
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i] as { type?: string; role?: string } | null;
    if (item?.type === "message" && item.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return [...history, ...input];
  return [
    ...input.slice(0, lastUserIdx + 1),
    ...history,
    ...input.slice(lastUserIdx + 1),
  ];
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
