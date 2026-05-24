import { OpenAIClient, isReasoningModel } from "./openai";

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
