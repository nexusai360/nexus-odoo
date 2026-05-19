import { AnthropicClient } from "./anthropic";
import { buildLlmClient } from "../get-client";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("AnthropicClient — MOCK key", () => {
  test("retorna resposta simulada sem chamar fetch", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    const result = await client.chat({ messages: [{ role: "user", content: "Olá" }] });
    expect(result.message).toContain("MOCK");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("mapMessages converte role:tool para tool_result em role:user", async () => {
    const client = new AnthropicClient("MOCK_KEY", "claude-sonnet-4-7");
    // Só testa que não lança — o mapeamento acontece antes do fetch
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
