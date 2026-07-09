jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { pipelineGeracao } from "./pipeline";
import type { GeracaoDeps, ProgressoGeracao, EntradaGeracao } from "./types";

const COMPOSITOR_OK = JSON.stringify({
  titulo: "Panorama do estoque",
  objetivo: "saude e concentracao",
  blocos: [
    { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
    { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
    { tipo: "Ranking", metrica: "estoque.valor_marca", recorte: "marca" },
  ],
});
const CRITICO_OK = JSON.stringify({
  justificativa: "mantive as metricas, respondem a intencao",
  plano: {
    titulo: "Panorama do estoque",
    objetivo: "saude e concentracao",
    blocos: [
      { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
      { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
      { tipo: "Ranking", metrica: "estoque.valor_marca", recorte: "marca" },
    ],
  },
});

const ENTRADA: EntradaGeracao = {
  entendimento: "saude do estoque e concentracao",
  intencao: { secoes: [{ fato: "fato_estoque_saldo", template: "KPIRow" }] },
  historico: [],
  user: { id: "u1" },
};

function clienteRoteirizado(respostas: string[]) {
  let i = 0;
  return {
    provider: "anthropic",
    model: "claude",
    chat: async (req: { onToken?: (t: string) => void }) => {
      req.onToken?.("a");
      req.onToken?.("b");
      return { message: respostas[i++], usage: { tokensInput: 10, tokensOutput: 20, costUsd: 0 } };
    },
  };
}

const resolverFake = jest.fn(async (fato: string, shape: string) => {
  if (fato === "fato_estoque_saldo" && shape === "kpis") {
    return { linhas: [], kpis: { valorTotal: 49447434.34, totalProdutos: 1894, produtosNegativos: 172 } };
  }
  if (shape === "agregacaoCategorica") {
    return { linhas: [{ rotulo: "A", valor: 10 }, { rotulo: "B", valor: 5 }] };
  }
  if (shape === "serieTemporal") {
    // 4+ pontos: o revisor NAO degrada a tendencia (Combo sobrevive).
    return { linhas: [{ mes: "2026-01" }, { mes: "2026-02" }, { mes: "2026-03" }, { mes: "2026-04" }] };
  }
  return { linhas: [] };
});

function deps(
  cliente: unknown,
  logUsage = jest.fn().mockResolvedValue(undefined),
  criarCliente = jest.fn(async () => cliente as never),
): GeracaoDeps {
  return { criarCliente, logUsage, resolver: resolverFake };
}

describe("pipelineGeracao (compositor + critico + revisor)", () => {
  it("caminho feliz: 2 chamadas LLM, KPIs distintos preservados, ranking redundante cortado", async () => {
    const cliente = clienteRoteirizado([COMPOSITOR_OK, CRITICO_OK]);
    const logUsage = jest.fn().mockResolvedValue(undefined);
    const progresso: ProgressoGeracao[] = [];
    const out = await pipelineGeracao(ENTRADA, (p) => progresso.push(p), deps(cliente, logUsage));

    const kpi = out.ficha.secoes.find((s) => s.template === "KPIRow");
    expect((kpi?.config.campos as string[]).length).toBe(3); // 3 KPIs distintos preservados
    expect(out.ficha.secoes.filter((s) => s.template === "BarChart")).toHaveLength(1); // 2 -> 1
    expect(logUsage).toHaveBeenCalledTimes(2); // compositor + critico
    const pcts = progresso.map((p) => p.pct);
    expect(pcts[pcts.length - 1]).toBe(100);
  });

  it("gerar_ja: 0 chamada LLM (template deterministico)", async () => {
    const criarCliente = jest.fn(async () => clienteRoteirizado([]) as never);
    const logUsage = jest.fn().mockResolvedValue(undefined);
    const d = deps(clienteRoteirizado([]), logUsage, criarCliente);
    const out = await pipelineGeracao({ ...ENTRADA, modo: "gerar_ja" }, () => {}, d);

    expect(criarCliente).not.toHaveBeenCalled();
    expect(logUsage).not.toHaveBeenCalled();
    expect(out.ficha.secoes.length).toBeGreaterThanOrEqual(3);
  });

  it("gerar_ja com dominioTemplate financeiro: mostra Combo e Waterfall, 0 LLM", async () => {
    const criarCliente = jest.fn(async () => clienteRoteirizado([]) as never);
    const logUsage = jest.fn().mockResolvedValue(undefined);
    const d = deps(clienteRoteirizado([]), logUsage, criarCliente);
    const out = await pipelineGeracao(
      { ...ENTRADA, modo: "gerar_ja", dominioTemplate: "financeiro" },
      () => {},
      d,
    );
    expect(criarCliente).not.toHaveBeenCalled();
    const tpls = out.ficha.secoes.map((s) => s.template);
    expect(tpls).toContain("Combo");
    expect(tpls).toContain("Waterfall");
  });

  it("plano vazio (tudo fora do catalogo) -> erro limpo", async () => {
    const vazio = JSON.stringify({ titulo: "t", objetivo: "o", blocos: [{ tipo: "Ranking", metrica: "vendas.x", recorte: "y" }] });
    const cliente = clienteRoteirizado([vazio]);
    await expect(pipelineGeracao(ENTRADA, () => {}, deps(cliente))).rejects.toThrow();
  });
});
