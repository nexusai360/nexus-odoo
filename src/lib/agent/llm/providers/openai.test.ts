import {
  OpenAIClient,
  isReasoningModel,
  parseOpenAiUsage,
  buildResponsesResult,
  parseResponsesSseEvent,
  consumeResponsesStream,
  type ResponsesPayload,
} from "./openai";

/** Cria um ReadableStream a partir de pedacos de texto (simula o corpo SSE). */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

/** Monta um bloco de evento SSE `event:`/`data:` da Responses API. */
function sse(type: string, data: object): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/** Evento terminal `response.completed` com um `response` pronto. */
function sseCompleted(response: ResponsesPayload): string {
  return sse("response.completed", { response });
}

describe("parseOpenAiUsage", () => {
  test("le cached_tokens da Responses API", () => {
    const u = parseOpenAiUsage({
      input_tokens: 20000,
      output_tokens: 800,
      input_tokens_details: { cached_tokens: 18000 },
    });
    expect(u).toEqual({ tokensInput: 20000, tokensOutput: 800, tokensCachedInput: 18000 });
  });

  test("le cached_tokens do chat completions", () => {
    const u = parseOpenAiUsage({
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 64 },
    });
    expect(u).toEqual({ tokensInput: 100, tokensOutput: 10, tokensCachedInput: 64 });
  });

  test("fallback: cached ausente ou usage nulo => 0", () => {
    expect(parseOpenAiUsage({ input_tokens: 100, output_tokens: 10 }).tokensCachedInput).toBe(0);
    expect(parseOpenAiUsage(undefined)).toEqual({ tokensInput: 0, tokensOutput: 0, tokensCachedInput: 0 });
  });
});

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe("OpenAIClient , MOCK key", () => {
  test("retorna resposta simulada sem chamar fetch", async () => {
    const client = new OpenAIClient("MOCK_KEY", "gpt-4o-mini");
    const result = await client.chat({ messages: [{ role: "user", content: "Olá" }] });
    expect(result.message).toContain("MOCK");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("mapMessages/mapTools: não lança com toolCalls e mensagem tool", async () => {
    const client = new OpenAIClient("MOCK_KEY", "gpt-4o-mini");
    const result = await client.chat({
      messages: [
        { role: "user", content: "Pergunta" },
        { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "fn", arguments: {} }] },
        { role: "tool", content: "resultado", toolCallId: "tc1" },
      ],
      tools: [{ name: "fn", description: "desc", parameters: { type: "object", properties: {} } }],
    });
    expect(result.message).toContain("MOCK");
  });
});

describe("prompt_cache_key (alavanca 1)", () => {
  test("inclui prompt_cache_key no body da Responses API quando fornecido", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: streamFrom([
        sseCompleted({
          output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
          usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 0 } },
        }),
      ]),
    });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    await client.chat({
      messages: [{ role: "user", content: "oi" }],
      promptCacheKey: "nex-sys-abc123",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.prompt_cache_key).toBe("nex-sys-abc123");
    expect(body.stream).toBe(true);
  });

  test("sem promptCacheKey, o campo nao vai no body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: streamFrom([
        sseCompleted({
          output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      ]),
    });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    await client.chat({ messages: [{ role: "user", content: "oi" }] });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.prompt_cache_key).toBeUndefined();
  });
});

describe("buildResponsesResult (parse compartilhado streaming/nao-streaming)", () => {
  test("extrai usage (tokens + custo) , invariante do menu de Consumo", () => {
    const r = buildResponsesResult(
      "gpt-5.4-mini",
      {
        output: [{ type: "message", content: [{ type: "output_text", text: "Resposta" }] }],
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          input_tokens_details: { cached_tokens: 800 },
          output_tokens_details: { reasoning_tokens: 64 },
        },
      },
      true,
    );
    expect(r.message).toBe("Resposta");
    expect(r.usage.tokensInput).toBe(1000);
    expect(r.usage.tokensOutput).toBe(200);
    expect(r.usage.tokensCachedInput).toBe(800);
    expect(r.reasoningTokens).toBe(64);
    expect(Number.isFinite(r.usage.costUsd)).toBe(true);
    expect(r.streamed).toBe(true);
  });

  test("monta toolCalls e reasoningContext a partir do output", () => {
    const r = buildResponsesResult(
      "gpt-5.4-mini",
      {
        output: [
          { type: "reasoning", id: "rs_1", summary: ["pensando"] },
          { type: "function_call", call_id: "call_1", name: "fiscal_faturamento_periodo", arguments: '{"a":1}' },
        ],
        usage: { input_tokens: 5, output_tokens: 1 },
      },
      false,
    );
    expect(r.toolCalls).toEqual([
      { id: "call_1", name: "fiscal_faturamento_periodo", arguments: { a: 1 } },
    ]);
    expect(r.reasoningContext?.provider).toBe("openai");
    // O `id` do reasoning (referencia a state nao-persistido) e removido.
    const items = (r.reasoningContext?.data as { items: Array<{ id?: string }> }).items;
    expect(items[0].id).toBeUndefined();
    expect(r.streamed).toBe(false);
  });
});

describe("parseResponsesSseEvent", () => {
  test("parseia o JSON do data e expoe type + response", () => {
    const raw = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 1 } } })}`;
    const evt = parseResponsesSseEvent(raw);
    expect(evt?.type).toBe("response.completed");
    expect(evt?.response?.usage?.input_tokens).toBe(1);
  });

  test("[DONE] e linhas sem data viram null", () => {
    expect(parseResponsesSseEvent("data: [DONE]")).toBeNull();
    expect(parseResponsesSseEvent("event: ping")).toBeNull();
    expect(parseResponsesSseEvent(": comentario")).toBeNull();
  });
});

describe("consumeResponsesStream", () => {
  test("monta o response final a partir dos eventos SSE", async () => {
    const body = streamFrom([
      sse("response.created", { response: {} }),
      sse("response.output_text.delta", { delta: "Res" }),
      sseCompleted({
        output: [{ type: "message", content: [{ type: "output_text", text: "Resposta" }] }],
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
    ]);
    const rData = await consumeResponsesStream(body, { idleMs: 5000 });
    expect(rData.usage?.input_tokens).toBe(10);
    expect(rData.output?.[0].type).toBe("message");
  });

  test("buffer: evento partido entre dois chunks ainda e montado", async () => {
    const full = sseCompleted({ usage: { input_tokens: 7, output_tokens: 2 } });
    const meio = Math.floor(full.length / 2);
    const body = streamFrom([full.slice(0, meio), full.slice(meio)]);
    const rData = await consumeResponsesStream(body, { idleMs: 5000 });
    expect(rData.usage?.input_tokens).toBe(7);
  });

  test("stream que termina sem response.completed lanca", async () => {
    const body = streamFrom([sse("response.created", { response: {} })]);
    await expect(consumeResponsesStream(body, { idleMs: 5000 })).rejects.toThrow(
      /sem response.completed/,
    );
  });

  test("evento de erro do stream lanca", async () => {
    const body = streamFrom([sse("response.failed", { response: { error: "x" } })]);
    await expect(consumeResponsesStream(body, { idleMs: 5000 })).rejects.toThrow(/stream error/);
  });
});

describe("chat() via streaming (ponta a ponta no provider)", () => {
  test("retorna usage correto a partir do stream (Consumo intacto)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: streamFrom([
        sseCompleted({
          output: [{ type: "message", content: [{ type: "output_text", text: "12 filiais" }] }],
          usage: { input_tokens: 1234, output_tokens: 56, output_tokens_details: { reasoning_tokens: 8 } },
        }),
      ]),
    });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    const r = await client.chat({ messages: [{ role: "user", content: "quantas filiais?" }] });
    expect(r.message).toBe("12 filiais");
    expect(r.usage.tokensInput).toBe(1234);
    expect(r.usage.tokensOutput).toBe(56);
    expect(r.reasoningTokens).toBe(8);
    expect(r.streamed).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("fallback nao-streaming quando o stream falha (nunca regride)", async () => {
    // 1a chamada: stream invalido (termina sem completed) -> erro nao-timeout.
    // 2a chamada: nao-streaming com json valido -> resultado vem dela.
    mockFetch
      .mockResolvedValueOnce({ ok: true, body: streamFrom([sse("response.created", { response: {} })]) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [{ type: "message", content: [{ type: "output_text", text: "via fallback" }] }],
          usage: { input_tokens: 9, output_tokens: 1 },
        }),
      });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    const r = await client.chat({ messages: [{ role: "user", content: "oi" }] });
    expect(r.message).toBe("via fallback");
    expect(r.usage.tokensInput).toBe(9);
    expect(r.streamed).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // A 2a chamada (fallback) NAO leva stream:true.
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(body2.stream).toBeUndefined();
  });
});

describe("isReasoningModel", () => {
  test("modelos GPT-5.x são reasoning", () => {
    expect(isReasoningModel("gpt-5.5")).toBe(true);
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
  });

  test("modelos o1/o3/o4 são reasoning", () => {
    expect(isReasoningModel("o1")).toBe(true);
    expect(isReasoningModel("o3-pro")).toBe(true);
  });

  test("gpt-4o não é reasoning", () => {
    expect(isReasoningModel("gpt-4o")).toBe(false);
    expect(isReasoningModel("gpt-4o-mini")).toBe(false);
  });
});
