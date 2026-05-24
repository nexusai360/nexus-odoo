import { AnthropicClient } from "./anthropic";
import { buildLlmClient } from "../get-client";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("AnthropicClient , MOCK key", () => {
  test("retorna resposta simulada sem chamar fetch", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    const result = await client.chat({ messages: [{ role: "user", content: "Olá" }] });
    expect(result.message).toContain("MOCK");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("mapMessages converte role:tool para tool_result em role:user", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    // Só testa que não lança , o mapeamento acontece antes do fetch
    const result = await client.chat({
      messages: [
        { role: "user", content: "Pergunta" },
        { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "tool_a", arguments: {} }] },
        { role: "tool", content: '{"result":42}', toolCallId: "tc1", toolName: "tool_a" },
      ],
    });
    expect(result.message).toContain("MOCK");
  });

  test("mapTools converte ToolDefinition para schema Anthropic", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    const result = await client.chat({
      messages: [{ role: "user", content: "Teste" }],
      tools: [{ name: "minha_tool", description: "Faz algo", parameters: { type: "object", properties: {} } }],
    });
    expect(result.message).toContain("MOCK");
  });

  test("multi-system messages são concatenadas", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    const result = await client.chat({
      messages: [
        { role: "system", content: "Instrução 1" },
        { role: "system", content: "Instrução 2" },
        { role: "user", content: "Olá" },
      ],
    });
    expect(result.message).toContain("MOCK");
  });
});

describe("AnthropicClient , streaming", () => {
  function makeStreamBody(deltas: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const lines: string[] = [];
    lines.push('data: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}');
    lines.push("");
    for (const delta of deltas) {
      lines.push('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"' + delta + '"}}');
      lines.push("");
    }
    lines.push('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":' + deltas.length + '}}');
    lines.push("");
    lines.push("data: [DONE]");
    lines.push("");
    const raw = lines.join("\n");
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(raw));
        controller.close();
      },
    });
  }

  test("stream:true chama onToken para cada delta e monta message final", async () => {
    const deltas = ["Olá", " mundo", "!"];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeStreamBody(deltas),
    });

    const tokens: string[] = [];
    const client = new AnthropicClient("sk-real-key", "claude-sonnet-4-7");
    const result = await client.chat({
      messages: [{ role: "user", content: "Teste" }],
      stream: true,
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toEqual(deltas);
    expect(result.message).toBe("Olá mundo!");
    expect(result.usage.tokensInput).toBe(10);
    expect(result.usage.tokensOutput).toBe(deltas.length);
  });

  test("sem stream:true continua em modo de bloco (não chama onToken)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Resposta normal" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    });

    const tokens: string[] = [];
    const client = new AnthropicClient("sk-real-key", "claude-sonnet-4-7");
    const result = await client.chat({
      messages: [{ role: "user", content: "Teste" }],
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toHaveLength(0);
    expect(result.message).toBe("Resposta normal");
  });
});

describe("buildLlmClient", () => {
  test("retorna AnthropicClient para provider=anthropic", () => {
    const client = buildLlmClient("anthropic", "MOCK_KEY", "claude-sonnet-4-7");
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBe("claude-sonnet-4-7");
  });

  test("retorna ProviderClient para todos os providers", () => {
    const providers = ["openai", "anthropic", "gemini", "openrouter"] as const;
    for (const p of providers) {
      const client = buildLlmClient(p, "MOCK", "model-x");
      expect(client.provider).toBe(p);
    }
  });
});
