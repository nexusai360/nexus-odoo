import { OpenAIClient, isReasoningModel, parseOpenAiUsage } from "./openai";

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
      json: async () => ({
        output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
        usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 0 } },
      }),
    });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    await client.chat({
      messages: [{ role: "user", content: "oi" }],
      promptCacheKey: "nex-sys-abc123",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.prompt_cache_key).toBe("nex-sys-abc123");
  });

  test("sem promptCacheKey, o campo nao vai no body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
    });
    const client = new OpenAIClient("sk-test", "gpt-5.4-mini");
    await client.chat({ messages: [{ role: "user", content: "oi" }] });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.prompt_cache_key).toBeUndefined();
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
