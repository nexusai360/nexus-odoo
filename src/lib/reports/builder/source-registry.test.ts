import {
  listarFontes,
  obterContrato,
  obterProdutor,
} from "./source-registry";

const querySaldoProduto = jest.fn();
const queryConcentracao = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/reports/queries/estoque", () => ({
  querySaldoProduto: (...a: unknown[]) => querySaldoProduto(...a),
  queryConcentracao: (...a: unknown[]) => queryConcentracao(...a),
  queryValorArmazem: jest.fn(),
  queryEntradasSaidas: jest.fn(),
  queryProdutosParados: jest.fn(),
  queryTopMovimentados: jest.fn(),
}));

beforeEach(() => {
  querySaldoProduto.mockReset();
  queryConcentracao.mockReset();
});

describe("source-registry , todos os fatos ativados", () => {
  it("expoe todas as dimensoes de estoque como fontes", () => {
    const fatos = listarFontes().map((f) => f.fato).sort();
    expect(fatos).toEqual(
      [
        "fato_estoque_armazem",
        "fato_estoque_familia",
        "fato_estoque_local_produto",
        "fato_estoque_marca",
        "fato_estoque_movimento",
        "fato_estoque_parados",
        "fato_estoque_saldo",
        "fato_estoque_top_movimentados",
      ].sort(),
    );
  });

  it("cada novo fato tem produtor para os shapes que declara", () => {
    for (const fonte of listarFontes()) {
      for (const shape of fonte.shapes) {
        expect(typeof obterProdutor(fonte.fato, shape)).toBe("function");
      }
    }
  });

  it("armazem oferece serie/kpis/tabela coerentes", () => {
    const c = obterContrato("fato_estoque_armazem");
    expect(c?.shapes).toEqual(expect.arrayContaining(["agregacaoCategorica", "kpis", "tabela"]));
    expect(obterProdutor("fato_estoque_movimento", "serieTemporal")).toBeDefined();
  });
});

describe("source-registry", () => {
  it("listarFontes inclui fato_estoque_saldo com os 3 shapes", () => {
    const c = listarFontes().find((f) => f.fato === "fato_estoque_saldo");
    expect(c).toBeDefined();
    expect([...(c!.shapes)].sort()).toEqual(
      ["agregacaoCategorica", "kpis", "tabela"].sort(),
    );
  });

  it("obterContrato de fato inexistente e undefined", () => {
    expect(obterContrato("fato_inexistente")).toBeUndefined();
  });

  it("produtor de tabela roda querySaldoProduto e devolve linhas", async () => {
    querySaldoProduto.mockResolvedValue({
      kpis: { totalProdutos: 2, valorTotal: 1500 },
      linhas: [{ produtoNome: "Esteira", valorTotal: 1000 }],
    });
    const produtor = obterProdutor("fato_estoque_saldo", "tabela");
    expect(produtor).toBeDefined();
    const raw = await produtor!({});
    expect(raw.linhas).toEqual([{ produtoNome: "Esteira", valorTotal: 1000 }]);
  });

  it("produtor de agregacaoCategorica roda queryConcentracao", async () => {
    queryConcentracao.mockResolvedValue({
      familiasBruto: [{ rotulo: "Cardio", valor: 900 }],
      marcasBruto: [],
    });
    const produtor = obterProdutor("fato_estoque_saldo", "agregacaoCategorica");
    const raw = await produtor!({});
    expect(raw.linhas).toEqual([{ rotulo: "Cardio", valor: 900 }]);
  });

  it("produtor de shape nao oferecido e undefined", () => {
    expect(obterProdutor("fato_estoque_saldo", "serieTemporal")).toBeUndefined();
  });
});
