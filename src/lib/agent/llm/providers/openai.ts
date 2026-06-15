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

/** Usage cru da OpenAI: Responses API usa input_tokens/output_tokens; chat
 *  completions usa prompt_tokens/completion_tokens. Tokens cacheados vem em
 *  *_tokens_details.cached_tokens (alavanca 1, prompt caching). */
export interface OpenAiUsageRaw {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Normaliza o usage dos dois endpoints, extraindo tokens cacheados (default 0
 *  quando o provider nao expoe , degrada sem quebrar). */
export function parseOpenAiUsage(u: OpenAiUsageRaw | undefined | null): {
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
} {
  const usage = u ?? {};
  const tokensInput = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const tokensOutput = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const tokensCachedInput =
    usage.input_tokens_details?.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    0;
  return { tokensInput, tokensOutput, tokensCachedInput };
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Guarda do FALLBACK nao-streaming (unica via sem liveness): teto total da
 *  chamada. So vale para o caminho de fallback; override por modelo via
 *  cap.requestTimeoutMs. O streaming NAO usa teto total (ver STREAM_IDLE). */
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TENTATIVAS_TIMEOUT = 2; // 1 retry de streaming antes de cair pro fallback.
// Streaming: maximo de SILENCIO tolerado (sem nenhum byte/evento), tanto no
// handshake (ate o 1o byte) quanto entre eventos. NAO e um teto total: um stream
// vivo (mandando tokens) roda o quanto precisar. So abandona se ficar mudo por
// este tempo , sinal forte de conexao travada , e ai retenta. Substitui o antigo
// teto total de 90-120s, que era cego (nao distinguia "trabalhando" de "morto").
const STREAM_IDLE_TIMEOUT_MS = 15_000;

/**
 * Forma do corpo final da Responses API (o objeto `response`). Identico no
 * caminho nao-streaming (corpo JSON) e no streaming (evento `response.completed`).
 * E a fonte de `usage` (custo/tokens do menu de Consumo) e do texto/toolCalls.
 */
export interface ResponsesPayload {
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
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/**
 * Monta o ChatResult a partir do `response` final (mesma logica para streaming e
 * nao-streaming). Centraliza a extracao de texto, toolCalls, reasoning e , o
 * ponto critico , `usage` (tokens + custo). NAO muda o contrato consumido pelo
 * run-agent/logUsage/menu de Consumo.
 */
export function buildResponsesResult(
  model: string,
  rData: ResponsesPayload,
  streamed: boolean,
): ChatResult {
  let text = rData.output_text ?? "";
  const toolCalls: ToolCall[] = [];
  // Items a preservar como contexto opaco para o proximo turno: APENAS items
  // tipo "reasoning" (function_call NAO entra, duplicaria no proximo turno).
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
    } else if (item.type === "reasoning") {
      // Remove `id` (referencia a state nao-persistido) e preserva summary/content.
      const { id: _rsId, ...rsWithoutId } = item;
      void _rsId;
      reasoningItems.push(rsWithoutId);
    }
  }

  const { tokensInput: tIn, tokensOutput: tOut, tokensCachedInput: tCached } =
    parseOpenAiUsage(rData.usage);
  const rTokens = rData.usage?.output_tokens_details?.reasoning_tokens;
  const { costUsd } = calculateCost(model, tIn, tOut, { cachedInputTokens: tCached });

  const reasoningContext: ReasoningContext | undefined =
    reasoningItems.length > 0
      ? { provider: "openai", data: { items: reasoningItems } }
      : undefined;

  return {
    message: text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: { tokensInput: tIn, tokensOutput: tOut, tokensCachedInput: tCached, costUsd: costUsd ?? 0 },
    reasoningTokens: typeof rTokens === "number" ? rTokens : undefined,
    reasoningContext,
    streamed,
  };
}

/**
 * Parseia UM bloco de evento SSE (linhas `event:`/`data:`) e devolve o JSON do
 * `data`, ou null quando nao ha data util (`[DONE]`, comentario, vazio).
 */
export function parseResponsesSseEvent(
  rawEvent: string,
): { type?: string; response?: ResponsesPayload } | null {
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    const l = line.replace(/^﻿/, "").trimStart();
    if (l.startsWith("data:")) dataLines.push(l.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  if (payload === "" || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as { type?: string; response?: ResponsesPayload };
  } catch {
    return null;
  }
}

/**
 * Consome o stream SSE da Responses API e devolve o `response` final (mesma
 * forma do corpo nao-streaming). Implementa idle-timeout: se ficar `idleMs` sem
 * NENHUM chunk, aborta e lanca TimeoutError (retentavel). Lanca em erro de
 * stream e quando termina sem `response.completed`.
 */
export async function consumeResponsesStream(
  body: ReadableStream<Uint8Array>,
  opts: { idleMs: number },
): Promise<ResponsesPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: ResponsesPayload | undefined;
  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      void reader.cancel();
    }, opts.idleMs);
  };

  armIdle();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const evt = parseResponsesSseEvent(raw);
        if (!evt) continue;
        if (evt.type === "response.completed" || evt.type === "response.incomplete") {
          if (evt.response) finalResponse = evt.response;
        } else if (evt.type === "response.failed" || evt.type === "error") {
          throw new Error(
            `OpenAI Responses stream error: ${JSON.stringify(evt).slice(0, 300)}`,
          );
        }
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }

  if (timedOut) {
    const e = new Error(`OpenAI Responses stream idle > ${opts.idleMs}ms`);
    e.name = "TimeoutError";
    throw e;
  }
  if (!finalResponse) {
    throw new Error("OpenAI Responses stream: terminou sem response.completed");
  }
  return finalResponse;
}

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

    const { tokensInput, tokensOutput, tokensCachedInput } = parseOpenAiUsage(
      data.usage,
    );
    const { costUsd } = calculateCost(this.model, tokensInput, tokensOutput, {
      cachedInputTokens: tokensCachedInput,
    });

    return {
      message: choice.message.content ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: { tokensInput, tokensOutput, tokensCachedInput, costUsd: costUsd ?? 0 },
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
    // Alavanca 1: dica de roteamento de cache de prompt. Estavel entre chamadas
    // com o mesmo prefixo (system) => melhora a taxa de acerto do cache.
    if (request.promptCacheKey) {
      respBody.prompt_cache_key = request.promptCacheKey;
    }

    const timeoutMs = cap?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    // STREAMING primeiro, SEM teto total: o unico guarda e o SILENCIO (idle).
    // - handshake: aborta se o 1o byte nao chegar em STREAM_IDLE_TIMEOUT_MS.
    // - corpo: consumeResponsesStream aborta se ficar mudo por esse mesmo tempo.
    // Enquanto chegam eventos, a chamada roda o quanto precisar (resposta lenta
    // porem viva nao e morta). Em silencio (trava), abandona e retenta; se o
    // streaming falhar de vez, cai pro fallback nao-streaming (com teto total,
    // pois la nao ha liveness). O `usage`/custo vem do evento final, identico ao
    // nao-streaming => menu de Consumo intacto.
    let rData: ResponsesPayload | undefined;
    let streamed = false;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_TIMEOUT; tentativa++) {
      try {
        const ctrl = new AbortController();
        const handshakeTimer = setTimeout(() => ctrl.abort(), STREAM_IDLE_TIMEOUT_MS);
        let sRes: Response;
        try {
          sRes = await fetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({ ...respBody, stream: true }),
            signal: ctrl.signal,
          });
        } finally {
          // Cabecalho chegou (ou abortou): a partir daqui quem governa o corpo
          // e o idle do consumeResponsesStream, nao um teto total.
          clearTimeout(handshakeTimer);
        }
        if (!sRes.ok) {
          const text = await sRes.text().catch(() => "");
          throw new Error(`OpenAI Responses ${sRes.status}: ${text || sRes.statusText}`);
        }
        if (!sRes.body) throw new Error("OpenAI Responses stream: corpo vazio");
        rData = await consumeResponsesStream(sRes.body, { idleMs: STREAM_IDLE_TIMEOUT_MS });
        streamed = true;
        break;
      } catch (err) {
        const mudo =
          err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        if (mudo && tentativa < MAX_TENTATIVAS_TIMEOUT) {
          console.warn(
            `[openai] Responses stream em silencio > ${STREAM_IDLE_TIMEOUT_MS}ms (tentativa ${tentativa}/${MAX_TENTATIVAS_TIMEOUT}); retentando...`,
          );
          continue;
        }
        // Esgotou o streaming OU erro nao-silencio: fallback nao-streaming.
        console.warn(
          `[openai] Responses streaming falhou (${(err as Error).message}); fallback nao-streaming.`,
        );
        rData = await this.fetchResponsesNonStreaming(respBody, timeoutMs);
        streamed = false;
        break;
      }
    }
    if (!rData) {
      throw new Error("OpenAI Responses: sem resposta apos as tentativas");
    }

    return buildResponsesResult(this.model, rData, streamed);
  }

  /**
   * Fallback nao-streaming da Responses API: uma chamada unica com o budget
   * cheio. Usado quando o streaming nao completa, para nunca regredir a
   * confiabilidade. Devolve o mesmo `response` que o streaming entrega.
   */
  private async fetchResponsesNonStreaming(
    respBody: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ResponsesPayload> {
    const rRes = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(respBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!rRes.ok) {
      const text = await rRes.text().catch(() => "");
      throw new Error(`OpenAI Responses ${rRes.status}: ${text || rRes.statusText}`);
    }
    return (await rRes.json()) as ResponsesPayload;
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
 *
 * Defensivos cumulativos:
 *  1. Strippa `id` interno (referencia a state nao-persistido com store:false)
 *     - sem isso a API retorna 404 "Item with id X not found".
 *  2. **Filtra items tipo "function_call"** , esses ja vem pelo conversation
 *     tracking do run-agent (assistant.toolCalls -> mapMessagesToResponsesInput).
 *     Reinjetar pelo history duplicaria o function_call e/ou deixaria orfao
 *     (sem function_call_output, que role:"tool" nao persiste), gerando
 *     400 "No tool output found for function call X".
 *  Cobre tambem history antigo (commits anteriores ao filtro) que ainda
 *  pode estar gravado em conversations.reasoning_history.
 */
function collectHistoryItems(history: ReasoningContext[] | undefined): unknown[] {
  if (!history) return [];
  const items: unknown[] = [];
  for (const ctx of history) {
    if (ctx.provider !== "openai") continue;
    const data = ctx.data as { items?: unknown[] } | null;
    if (!data?.items || !Array.isArray(data.items)) continue;
    for (const item of data.items) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      // Defensivo 2: pula function_call (e function_call_output, simetria).
      if (obj.type === "function_call" || obj.type === "function_call_output") {
        continue;
      }
      // Defensivo 1: strippa `id` interno de reasoning items.
      if (obj.type === "reasoning") {
        const { id: _id, ...rest } = obj;
        void _id;
        items.push(rest);
      } else {
        items.push(item);
      }
    }
  }
  return items;
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
