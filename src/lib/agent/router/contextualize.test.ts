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

describe("reformulateQuestion , heuristica de anafora (T4.3)", () => {
  const focoAtual = {
    metrica: { nome: "fiscal faturamento periodo", toolUsada: "fiscal_faturamento_periodo" },
    periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
    entidades: [{ tipo: "empresa", rotulo: "Matrix" }],
    turnoAtualizado: 4,
  };

  test("heuristica resolve -> retorna sem chamar LLM nem historico", async () => {
    const r = await reformulateQuestion({
      conversationId: "c1",
      currentQuestion: "e o faturamento dessa empresa?",
      nPairs: 5,
      llm,
      focoAtual,
      entidadesRecentes: [],
    });
    expect(r.used).toBe(true);
    expect(r.reformulated).toContain('da empresa "Matrix"');
    expect(getLastNPairs).not.toHaveBeenCalled();
    expect(buildLlmClient).not.toHaveBeenCalled();
  });

  test("ambiguidade real -> null sem LLM (regra 12b clarifica)", async () => {
    const r = await reformulateQuestion({
      conversationId: "c1",
      currentQuestion: "qual o estoque desse produto?",
      nPairs: 5,
      llm,
      focoAtual,
      entidadesRecentes: [
        { tipo: "produto", rotulo: "Esteira T600X", ultimoTurno: 5 },
        { tipo: "produto", rotulo: "Bike S400", ultimoTurno: 5 },
      ],
    });
    expect(r).toEqual({ reformulated: null, used: false });
    expect(buildLlmClient).not.toHaveBeenCalled();
  });

  test("nao-anaforica com foco presente -> segue o caminho LLM (CQR)", async () => {
    getLastNPairs.mockResolvedValue([
      { user: { id: "u1", content: "x", createdAt: new Date() }, assistant: { id: "a1", content: "y", createdAt: new Date() } },
    ]);
    mockChat("Faturamento total de junho de 2026");
    const r = await reformulateQuestion({
      conversationId: "c1",
      currentQuestion: "me da um panorama geral ai",
      nPairs: 5,
      llm,
      focoAtual,
      entidadesRecentes: [],
    });
    expect(buildLlmClient).toHaveBeenCalled();
    expect(r.used).toBe(true);
  });
});
