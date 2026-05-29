import { reformulateQuestion } from "./contextualize";

jest.mock("@/lib/agent/conversation", () => ({
  getLastNPairs: jest.fn(),
}));
jest.mock("@/lib/agent/llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));
jest.mock("@/lib/agent/llm/usage-logger", () => ({
  logUsage: jest.fn().mockResolvedValue(undefined),
}));

const { getLastNPairs } = jest.requireMock("@/lib/agent/conversation");
const { buildLlmClient } = jest.requireMock("@/lib/agent/llm/get-client");
const { logUsage } = jest.requireMock("@/lib/agent/llm/usage-logger");

const llm = { provider: "openai", apiKey: "sk-x", model: "gpt-5.4-nano" };

beforeEach(() => jest.clearAllMocks());

function mockChat(message: string) {
  buildLlmClient.mockReturnValue({
    chat: jest.fn().mockResolvedValue({
      message,
      usage: { tokensInput: 50, tokensOutput: 10 },
    }),
  });
}

describe("reformulateQuestion", () => {
  test("sem conversationId -> null sem chamar LLM", async () => {
    const r = await reformulateQuestion({
      conversationId: null,
      currentQuestion: "e do mes passado?",
      nPairs: 5,
      llm,
    });
    expect(r).toEqual({ reformulated: null, used: false });
    expect(getLastNPairs).not.toHaveBeenCalled();
    expect(buildLlmClient).not.toHaveBeenCalled();
  });

  test("sem pares -> null sem chamar LLM", async () => {
    getLastNPairs.mockResolvedValue([]);
    const r = await reformulateQuestion({
      conversationId: "c1",
      currentQuestion: "e do mes passado?",
      nPairs: 5,
      llm,
    });
    expect(r).toEqual({ reformulated: null, used: false });
    expect(buildLlmClient).not.toHaveBeenCalled();
  });

  test("com pares -> retorna pergunta reformulada e loga consumo router_reformulacao", async () => {
    getLastNPairs.mockResolvedValue([
      {
        user: { id: "u1", content: "produto que mais vendeu nesse mes?", createdAt: new Date() },
        assistant: { id: "a1", content: "Foi o Modelo X.", createdAt: new Date() },
      },
    ]);
    mockChat('Qual produto mais vendeu no mes passado?');
    const r = await reformulateQuestion({
      conversationId: "c1",
      currentQuestion: "e do mes passado?",
      nPairs: 5,
      llm,
      userId: "user-1",
      isPlayground: true,
    });
    expect(r.used).toBe(true);
    expect(r.reformulated).toBe("Qual produto mais vendeu no mes passado?");
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "router_reformulacao", model: "gpt-5.4-nano" }),
    );
  });

  test("remove aspas/markdown e pega a primeira linha não vazia", async () => {
    getLastNPairs.mockResolvedValue([
      { user: { id: "u1", content: "x", createdAt: new Date() }, assistant: { id: "a1", content: "y", createdAt: new Date() } },
    ]);
    mockChat('\n  "**Faturamento de maio de 2026**"  \nlixo extra');
    const r = await reformulateQuestion({ conversationId: "c1", currentQuestion: "e maio?", nPairs: 5, llm });
    expect(r.reformulated).toBe("Faturamento de maio de 2026");
  });

  test("timeout/erro -> null", async () => {
    getLastNPairs.mockResolvedValue([
      { user: { id: "u1", content: "x", createdAt: new Date() }, assistant: { id: "a1", content: "y", createdAt: new Date() } },
    ]);
    buildLlmClient.mockReturnValue({
      chat: jest.fn().mockRejectedValue(new Error("boom")),
    });
    const r = await reformulateQuestion({ conversationId: "c1", currentQuestion: "e maio?", nPairs: 5, llm });
    expect(r).toEqual({ reformulated: null, used: false });
  });
});
