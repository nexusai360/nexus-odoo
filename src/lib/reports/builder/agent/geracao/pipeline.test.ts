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
  it("UMA chamada de raciocinio ALTO + build + validacao; progresso monotonico ate 100", async () => {
    const { cliente, reqs } = clienteRoteirizado([BLUEPRINT_OK]);
    const progresso: ProgressoGeracao[] = [];
    const out = await pipelineGeracao(ENTRADA, (p) => progresso.push(p), deps(cliente));

    expect(out.ficha.secoes.length).toBeGreaterThanOrEqual(2);
    // SO uma chamada LLM (eficiencia): blueprint pensa tudo de uma vez.
    expect(reqs).toHaveLength(1);
    expect(reqs[0].reasoningEffort).toBe("high");
    const fases = progresso.map((p) => p.fase);
    expect(fases[0]).toBe("blueprint");
    expect(fases).not.toContain("revisao");
    expect(fases[fases.length - 1]).toBe("validacao");
    const pcts = progresso.map((p) => p.pct);
    for (let k = 1; k < pcts.length; k++) expect(pcts[k]).toBeGreaterThanOrEqual(pcts[k - 1]);
    expect(pcts[pcts.length - 1]).toBe(100);
    expect(progresso.filter((p) => p.fase === "blueprint").length).toBeGreaterThan(1);
  });

  it("curadoria: blueprint com KPIRow duplicada vira UMA so na ficha", async () => {
    const dup = JSON.stringify({
      titulo: "t", objetivo: "o",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", config: {} },
        { template: "KPIRow", fato: "fato_estoque_parados", config: {} },
        { template: "BarChart", fato: "fato_estoque_saldo", config: {} },
      ],
    });
    const { cliente } = clienteRoteirizado([dup]);
    const out = await pipelineGeracao(ENTRADA, () => {}, deps(cliente));
    expect(out.ficha.secoes.filter((s) => s.template === "KPIRow")).toHaveLength(1);
  });

  it("blueprint vazio (tudo fora do catalogo) -> erro limpo", async () => {
    const vazio = JSON.stringify({ titulo: "t", objetivo: "o", secoes: [{ template: "BarChart", fato: "fato_vendas", config: {} }] });
    const { cliente } = clienteRoteirizado([vazio]);
    await expect(pipelineGeracao(ENTRADA, () => {}, deps(cliente))).rejects.toThrow();
  });

  it("propaga omitidos e loga uso (uma vez)", async () => {
    const comOmitido = JSON.stringify({
      titulo: "t", objetivo: "o",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", config: {} },
        { template: "BarChart", fato: "fato_vendas", config: {} },
      ],
    });
    const { cliente } = clienteRoteirizado([comOmitido]);
    const logUsage = jest.fn().mockResolvedValue(undefined);
    const out = await pipelineGeracao(ENTRADA, () => {}, deps(cliente, logUsage));
    expect(out.omitidos.length).toBeGreaterThan(0);
    expect(logUsage).toHaveBeenCalledTimes(1);
  });
});
