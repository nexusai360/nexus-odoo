// F3 onda 3a: cache em memoria dos vetores de tool.
// Batch: embedAllTools usa embedMany (1 chamada para todo o catalogo).
jest.mock("../../rag/embed", () => ({
  embedMany: jest.fn(async (texts: string[]) =>
    texts.map((t) => [t.length, 0.2, 0.3]),
  ),
}));
jest.mock("../constants", () => ({
  getRouterEmbeddingConfig: () => ({ model: "text-embedding-3-small", dimensions: 1536 }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { embedMany } = require("../../rag/embed");
import { getToolVectors, __resetToolCache } from "../embed-tools";
import type { RetrievalTool } from "../types";

const tools: RetrievalTool[] = [
  { name: "fiscal_faturamento_periodo", description: "Faturamento no periodo." },
  { name: "estoque_saldo", description: "Saldo de estoque." },
];

beforeEach(() => {
  __resetToolCache();
  (embedMany as jest.Mock).mockClear();
});

describe("getToolVectors", () => {
  it("retorna um vetor por tool, indexado por name", async () => {
    const v = await getToolVectors(tools);
    expect(Object.keys(v).sort()).toEqual(["estoque_saldo", "fiscal_faturamento_periodo"]);
    expect(Array.isArray(v.estoque_saldo)).toBe(true);
  });

  it("embeda em lote: 1 chamada a embedMany com todas as descricoes", async () => {
    await getToolVectors(tools);
    expect((embedMany as jest.Mock).mock.calls.length).toBe(1);
    expect((embedMany as jest.Mock).mock.calls[0][0]).toEqual([
      "Faturamento no periodo.",
      "Saldo de estoque.",
    ]);
  });

  it("cacheia: segunda chamada com as mesmas tools nao re-embedda", async () => {
    await getToolVectors(tools);
    const callsAfter1 = (embedMany as jest.Mock).mock.calls.length;
    await getToolVectors(tools);
    expect((embedMany as jest.Mock).mock.calls.length).toBe(callsAfter1);
  });

  it("invalida o cache quando a descricao de uma tool muda", async () => {
    await getToolVectors(tools);
    const calls1 = (embedMany as jest.Mock).mock.calls.length;
    const mudadas = [{ ...tools[0]!, description: "Outra descricao." }, tools[1]!];
    await getToolVectors(mudadas);
    expect((embedMany as jest.Mock).mock.calls.length).toBeGreaterThan(calls1);
  });

  it("race-safe: chamadas concorrentes compartilham a mesma promise", async () => {
    const [a, b] = await Promise.all([getToolVectors(tools), getToolVectors(tools)]);
    expect(a).toBe(b);
    // 1 unica chamada em lote apesar das 2 chamadas concorrentes
    expect((embedMany as jest.Mock).mock.calls.length).toBe(1);
  });
});
