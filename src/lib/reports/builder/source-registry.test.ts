import {
  listarFontes,
  obterContrato,
  obterProdutor,
  clamparPeriodoPedido,
  type FiltrosFonte,
} from "./source-registry";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

const querySaldoProduto = jest.fn();
const queryConcentracao = jest.fn();
const queryEntradasSaidas = jest.fn();
const queryTopMovimentados = jest.fn();
const queryCaixaPeriodo = jest.fn();
const queryFluxoCaixa = jest.fn();
const queryResultadoPorConta = jest.fn();
const queryPedidosPeriodo = jest.fn();
const queryPedidosPorEtapa = jest.fn();
const queryPedidosPorVendedor = jest.fn();
const queryFaturamentoPeriodo = jest.fn();
const queryFaturamentoPorCliente = jest.fn();
const queryProdutosFaturados = jest.fn();

// `prisma` mockado como {} faz getCorteDados falhar de proposito e cair no padrao,
// entao o corte vigente nos testes e CORTE_DADOS_PADRAO (2026-03-16).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/reports/queries/estoque", () => ({
  querySaldoProduto: (...a: unknown[]) => querySaldoProduto(...a),
  queryConcentracao: (...a: unknown[]) => queryConcentracao(...a),
  queryValorArmazem: jest.fn(),
  queryEntradasSaidas: (...a: unknown[]) => queryEntradasSaidas(...a),
  queryProdutosParados: jest.fn(),
  queryTopMovimentados: (...a: unknown[]) => queryTopMovimentados(...a),
}));
jest.mock("@/lib/reports/queries/financeiro", () => ({
  querySaldoContas: jest.fn(),
  queryCaixaPeriodo: (...a: unknown[]) => queryCaixaPeriodo(...a),
  queryFluxoCaixa: (...a: unknown[]) => queryFluxoCaixa(...a),
}));
jest.mock("@/lib/reports/queries/financeiro-resultado", () => ({
  queryResultadoPorConta: (...a: unknown[]) => queryResultadoPorConta(...a),
}));
jest.mock("@/lib/reports/queries/comercial", () => ({
  queryPedidosPeriodo: (...a: unknown[]) => queryPedidosPeriodo(...a),
  queryPedidosPorEtapa: (...a: unknown[]) => queryPedidosPorEtapa(...a),
  queryPedidosPorVendedor: (...a: unknown[]) => queryPedidosPorVendedor(...a),
  queryPedidosAtrasados: jest.fn(),
}));
jest.mock("@/lib/reports/queries/fiscal", () => ({
  queryFaturamentoPeriodo: (...a: unknown[]) => queryFaturamentoPeriodo(...a),
  queryFaturamentoPorCliente: (...a: unknown[]) => queryFaturamentoPorCliente(...a),
  queryProdutosFaturados: (...a: unknown[]) => queryProdutosFaturados(...a),
}));

const CORTE = CORTE_DADOS_PADRAO; // 2026-03-16
const MES_DO_CORTE = "2026-03";
const DIA_ABERTO = "2100-01-01";
const MES_ABERTO = "9999-12";

beforeEach(() => {
  querySaldoProduto.mockReset();
  queryConcentracao.mockReset();
  queryEntradasSaidas.mockReset();
  queryTopMovimentados.mockReset();
  queryCaixaPeriodo.mockReset();
  queryFluxoCaixa.mockReset();
  queryResultadoPorConta.mockReset();
  queryPedidosPeriodo.mockReset();
  queryPedidosPorEtapa.mockReset();
  queryPedidosPorVendedor.mockReset();
  queryFaturamentoPeriodo.mockReset();
  queryFaturamentoPorCliente.mockReset();
  queryProdutosFaturados.mockReset();

  queryEntradasSaidas.mockResolvedValue({ serie: [], detalhe: [] });
  queryTopMovimentados.mockResolvedValue({ kpis: { totalProdutos: 0, totalUnidades: 0 }, linhas: [] });
  queryCaixaPeriodo.mockResolvedValue({ entrada: 10, saida: 4, saldo: 6 });
  queryFluxoCaixa.mockResolvedValue({ serie: [] });
  queryResultadoPorConta.mockResolvedValue({ totalReceita: 0, totalDespesa: 0, resultado: 0, linhas: [] });
  queryPedidosPeriodo.mockResolvedValue({ totalPedidos: 3, valorTotal: 900 });
  queryPedidosPorEtapa.mockResolvedValue({ linhas: [] });
  queryPedidosPorVendedor.mockResolvedValue({ linhas: [] });
  queryFaturamentoPeriodo.mockResolvedValue({ totalNotas: 5, valorFaturado: 1000 });
  queryFaturamentoPorCliente.mockResolvedValue({ linhas: [] });
  queryProdutosFaturados.mockResolvedValue({ linhas: [] });
});

describe("source-registry , todos os fatos ativados", () => {
  it("expoe as fontes de estoque E financeiro (onda 2)", () => {
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
        "fato_financeiro_saldo",
        "fato_financeiro_movimento",
        "fato_financeiro_resultado",
        "fato_comercial_pedido",
        "fato_comercial_etapa",
        "fato_comercial_vendedor",
        "fato_fiscal_faturamento",
        "fato_fiscal_cliente",
        "fato_fiscal_produto",
        "fato_cadastros_parceiro",
        "fato_cadastros_uf",
        "fato_contabil_plano",
        "fato_fiscal_preco",
        "fato_fiscal_servico",
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
  it("listarFontes inclui fato_estoque_saldo com seus shapes (inclui medidor p/ gauge)", () => {
    const c = listarFontes().find((f) => f.fato === "fato_estoque_saldo");
    expect(c).toBeDefined();
    expect([...(c!.shapes)].sort()).toEqual(
      ["agregacaoCategorica", "kpis", "medidor", "tabela"].sort(),
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

// ===========================================================================
// DATA DE INICIO DAS ANALISES: nenhuma fonte de historico pode varrer o cache inteiro,
// nem quando o produtor e chamado sem filtro (que e o caso real hoje: a barra de filtros
// do relatorio salvo e a amostra do motor de geracao chamam produtor({})).
// ===========================================================================
describe("source-registry , piso da data de inicio das analises", () => {
  it("movimento de estoque sem periodo comeca no mes do corte (nao no cache inteiro)", async () => {
    await obterProdutor("fato_estoque_movimento", "serieTemporal")!({});
    expect(queryEntradasSaidas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: MES_DO_CORTE, periodoAte: MES_ABERTO }),
    );
  });

  it("movimento de estoque com periodo anterior ao corte e grampeado no mes do corte", async () => {
    await obterProdutor("fato_estoque_movimento", "tabela")!({ periodoDe: "2025-01", periodoAte: "2026-06" });
    expect(queryEntradasSaidas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: MES_DO_CORTE, periodoAte: "2026-06" }),
    );
  });

  it("top movimentados passa a receber periodo (antes somava todo o historico)", async () => {
    await obterProdutor("fato_estoque_top_movimentados", "kpis")!({ sentido: "saida" });
    expect(queryTopMovimentados).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sentido: "saida", periodoDe: MES_DO_CORTE, periodoAte: MES_ABERTO }),
    );
  });

  it("caixa (financeiro) sem periodo comeca no corte, em dia", async () => {
    await obterProdutor("fato_financeiro_movimento", "kpis")!({});
    expect(queryCaixaPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      { periodoDe: CORTE, periodoAte: DIA_ABERTO },
    );
  });

  it("fluxo de caixa (serie) sem periodo comeca no corte", async () => {
    await obterProdutor("fato_financeiro_movimento", "serieTemporal")!({});
    expect(queryFluxoCaixa).toHaveBeenCalledWith(
      expect.anything(),
      { periodoDe: CORTE, periodoAte: DIA_ABERTO },
    );
  });

  it("DRE (resultado por conta) sem periodo comeca no corte nos tres shapes", async () => {
    await obterProdutor("fato_financeiro_resultado", "kpis")!({});
    await obterProdutor("fato_financeiro_resultado", "agregacaoCategorica")!({});
    await obterProdutor("fato_financeiro_resultado", "cascata")!({});
    for (const chamada of queryResultadoPorConta.mock.calls) {
      expect(chamada[1]).toEqual({ periodoDe: CORTE, periodoAte: DIA_ABERTO });
    }
    expect(queryResultadoPorConta).toHaveBeenCalledTimes(3);
  });

  it("pedidos (comercial) grampeiam o inicio do periodo pedido e expandem o mes em dias", async () => {
    await obterProdutor("fato_comercial_pedido", "kpis")!({ periodoDe: "2025-11", periodoAte: "2026-04" });
    expect(queryPedidosPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      { periodoDe: CORTE, periodoAte: "2026-04-30" },
    );
  });

  it("funil por etapa passa a receber o periodo clampado", async () => {
    await obterProdutor("fato_comercial_etapa", "agregacaoCategorica")!({});
    expect(queryPedidosPorEtapa).toHaveBeenCalledWith(
      expect.anything(),
      { periodoDe: CORTE, periodoAte: DIA_ABERTO },
    );
  });

  it("ranking de vendedores sem periodo comeca no corte", async () => {
    await obterProdutor("fato_comercial_vendedor", "agregacaoCategorica")!({});
    expect(queryPedidosPorVendedor).toHaveBeenCalledWith(
      expect.anything(),
      { periodoDe: CORTE, periodoAte: DIA_ABERTO },
    );
  });

  it("faturamento (fiscal) sem periodo comeca no corte, nos tres fatos", async () => {
    await obterProdutor("fato_fiscal_faturamento", "kpis")!({});
    await obterProdutor("fato_fiscal_cliente", "agregacaoCategorica")!({});
    await obterProdutor("fato_fiscal_produto", "agregacaoCategorica")!({});
    const esperado = { periodoDe: CORTE, periodoAte: DIA_ABERTO };
    expect(queryFaturamentoPeriodo).toHaveBeenCalledWith(expect.anything(), esperado);
    expect(queryFaturamentoPorCliente).toHaveBeenCalledWith(expect.anything(), esperado);
    expect(queryProdutosFaturados).toHaveBeenCalledWith(expect.anything(), esperado);
  });
});

describe("source-registry , delta de KPI contra a janela anterior", () => {
  it("nao emite kpisAnterior quando a janela anterior cai antes do corte", async () => {
    // Jan..Mar/2026 -> janela anterior Out..Dez/2025, que a plataforma nao analisa.
    const raw = await obterProdutor("fato_fiscal_faturamento", "kpis")!({
      periodoDe: "2026-01",
      periodoAte: "2026-03",
    });
    expect(raw.kpisAnterior).toBeUndefined();
    expect(queryFaturamentoPeriodo).toHaveBeenCalledTimes(1);
  });

  it("nao emite kpisAnterior no financeiro nem no comercial quando a base e pre-corte", async () => {
    const fin = await obterProdutor("fato_financeiro_movimento", "kpis")!({ periodoDe: "2026-03", periodoAte: "2026-03" });
    const com = await obterProdutor("fato_comercial_pedido", "kpis")!({ periodoDe: "2026-03", periodoAte: "2026-03" });
    expect(fin.kpisAnterior).toBeUndefined();
    expect(com.kpisAnterior).toBeUndefined();
    expect(queryCaixaPeriodo).toHaveBeenCalledTimes(1);
    expect(queryPedidosPeriodo).toHaveBeenCalledTimes(1);
  });

  it("emite kpisAnterior quando a janela anterior esta dentro da janela analisada", async () => {
    // Jul..Set/2026 -> anterior Abr..Jun/2026 (depois do corte).
    const raw = await obterProdutor("fato_fiscal_faturamento", "kpis")!({
      periodoDe: "2026-07",
      periodoAte: "2026-09",
    });
    expect(raw.kpisAnterior).toEqual({ totalNotas: 5, valorFaturado: 1000 });
    expect(queryFaturamentoPeriodo).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { periodoDe: "2026-04-01", periodoAte: "2026-06-30" },
    );
  });
});

describe("clamparPeriodoPedido", () => {
  it("grampeia o mes pedido ao mes do corte", () => {
    expect(clamparPeriodoPedido({ periodoDe: "2025-02", periodoAte: "2026-05" })).toEqual({
      periodoDe: MES_DO_CORTE,
      periodoAte: "2026-05",
    });
  });

  it("grampeia o dia pedido ao dia do corte", () => {
    expect(clamparPeriodoPedido({ periodoDe: "2024-08-01", periodoAte: "2026-05-31" })).toEqual({
      periodoDe: CORTE,
      periodoAte: "2026-05-31",
    });
  });

  it("periodo dentro da janela passa intacto e periodo ausente segue ausente", () => {
    expect(clamparPeriodoPedido({ periodoDe: "2026-06-01" })).toEqual({ periodoDe: "2026-06-01" });
    // Sem periodo nao inventa periodo: o piso e aplicado no produtor da fonte, que sabe
    // se ela recorta por mes ou por dia.
    const semPeriodo: FiltrosFonte = { marca: "Matrix" };
    expect(clamparPeriodoPedido(semPeriodo)).toEqual({ marca: "Matrix" });
  });
});
