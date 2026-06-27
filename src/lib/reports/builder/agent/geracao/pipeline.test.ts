jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { pipelineGeracao } from "./pipeline";
import type { GeracaoDeps, ProgressoGeracao, EntradaGeracao } from "./types";

const BLUEPRINT_OK = JSON.stringify({
  titulo: "Estoque por armazem",
  objetivo: "repor com base no saldo",
  secoes: [
    { template: "KPIRow", fato: "fato_estoque_saldo", config: { titulo: "Visao geral" } },
    { template: "BarChart", fato: "fato_estoque_saldo", config: { titulo: "Por armazem" } },
  ],
});
const REVISAO_OK = JSON.stringify({
  notas: ["narrativa: ok", "insight: destaquei o saldo baixo"],
  titulo: "Estoque por armazem",
  objetivo: "repor com base no saldo",
  secoes: [
    { template: "KPIRow", fato: "fato_estoque_saldo", config: { titulo: "Visao geral" } },
    { template: "BarChart", fato: "fato_estoque_saldo", config: { titulo: "Por armazem" } },
    { template: "DataTable", fato: "fato_estoque_saldo", config: { titulo: "Detalhe" } },
  ],
});

const ENTRADA: EntradaGeracao = {
  entendimento: "saldo por armazem para repor",
  intencao: { secoes: [{ fato: "fato_estoque_saldo", template: "BarChart" }] },
  historico: [],
  user: { id: "u1" },
};

/** Cliente que devolve as respostas em ordem e emite onToken (streaming). */
function clienteRoteirizado(respostas: (string | Error)[]) {
  const reqs: Array<{ reasoningEffort?: string }> = [];
  let i = 0;
  const cliente = {
    provider: "anthropic",
    model: "claude",
    chat: async (req: { reasoningEffort?: string; onToken?: (t: string) => void }) => {
      reqs.push({ reasoningEffort: req.reasoningEffort });
      req.onToken?.("a");
      req.onToken?.("b");
      req.onToken?.("c");
      const r = respostas[i++];
      if (r instanceof Error) throw r;
      return { message: r, usage: { tokensInput: 10, tokensOutput: 20, costUsd: 0 } };
    },
  };
  return { cliente, reqs };
}

function deps(cliente: unknown, logUsage = jest.fn().mockResolvedValue(undefined)): GeracaoDeps {
  return { criarCliente: async () => cliente as never, logUsage };
}

describe("pipelineGeracao", () => {
  it("encadeia as 4 fases, emite progresso monotonico (com heartbeats) e devolve ficha valida", async () => {
    const { cliente, reqs } = clienteRoteirizado([BLUEPRINT_OK, REVISAO_OK]);
    const progresso: ProgressoGeracao[] = [];
    const out = await pipelineGeracao(ENTRADA, (p) => progresso.push(p), deps(cliente));

    expect(out.ficha.secoes.length).toBeGreaterThanOrEqual(2);
    // ordem das fases
    const fases = progresso.map((p) => p.fase);
    expect(fases[0]).toBe("blueprint");
    expect(fases).toContain("revisao");
    expect(fases).toContain("build");
    expect(fases[fases.length - 1]).toBe("validacao");
    // pct monotonico nao-decrescente, terminando em 100
    const pcts = progresso.map((p) => p.pct);
    for (let k = 1; k < pcts.length; k++) expect(pcts[k]).toBeGreaterThanOrEqual(pcts[k - 1]);
    expect(pcts[pcts.length - 1]).toBe(100);
    // heartbeats: ha mais de um progresso DENTRO da fase blueprint
    expect(progresso.filter((p) => p.fase === "blueprint").length).toBeGreaterThan(1);
    // reasoning por fase: blueprint medium, revisao high
    expect(reqs[0].reasoningEffort).toBe("medium");
    expect(reqs[1].reasoningEffort).toBe("high");
  });

  it("degrade: revisao falha -> segue com o blueprint da fase 1, sem quebrar", async () => {
    const { cliente } = clienteRoteirizado([BLUEPRINT_OK, new Error("falha revisao")]);
    const progresso: ProgressoGeracao[] = [];
    const out = await pipelineGeracao(ENTRADA, (p) => progresso.push(p), deps(cliente));
    // ficha = derivada do blueprint da fase 1 (2 secoes), nao da revisao (3)
    expect(out.ficha.secoes).toHaveLength(2);
    // ainda emitiu build e validacao
    expect(progresso.map((p) => p.fase)).toContain("build");
    expect(progresso[progresso.length - 1].pct).toBe(100);
  });

  it("blueprint vazio (tudo fora do catalogo) -> erro limpo", async () => {
    const vazio = JSON.stringify({ titulo: "t", objetivo: "o", secoes: [{ template: "BarChart", fato: "fato_vendas", config: {} }] });
    const { cliente } = clienteRoteirizado([vazio]);
    await expect(pipelineGeracao(ENTRADA, () => {}, deps(cliente))).rejects.toThrow();
  });

  it("propaga omitidos do blueprint e loga uso por chamada LLM", async () => {
    const comOmitido = JSON.stringify({
      titulo: "t", objetivo: "o",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", config: {} },
        { template: "BarChart", fato: "fato_vendas", config: {} },
      ],
    });
    const { cliente } = clienteRoteirizado([comOmitido, JSON.stringify({ semReparos: true, notas: ["ok"] })]);
    const logUsage = jest.fn().mockResolvedValue(undefined);
    const out = await pipelineGeracao(ENTRADA, () => {}, deps(cliente, logUsage));
    expect(out.omitidos.length).toBeGreaterThan(0);
    expect(logUsage).toHaveBeenCalled();
  });
});
