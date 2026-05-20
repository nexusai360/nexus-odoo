import { GeminiClient } from "./gemini";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe("GeminiClient — MOCK key", () => {
  test("retorna resposta simulada sem chamar fetch", async () => {
    const client = new GeminiClient("MOCK_KEY", "gemini-2.5-flash");
    const result = await client.chat({ messages: [{ role: "user", content: "Olá" }] });
    expect(result.message).toContain("MOCK");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("role tool → functionResponse; assistant → role model (não lança)", async () => {
    const client = new GeminiClient("MOCK_KEY", "gemini-2.5-flash");
    const result = await client.chat({
      messages: [
        { role: "user", content: "Pergunta" },
        { role: "assistant", content: "Vou chamar a tool", toolCalls: [{ id: "tc1", name: "fn_a", arguments: {} }] },
        { role: "tool", content: "resultado", toolCallId: "tc1", toolName: "fn_a" },
      ],
    });
    expect(result.message).toContain("MOCK");
  });
});
