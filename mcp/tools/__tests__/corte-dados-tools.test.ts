// mcp/tools/__tests__/corte-dados-tools.test.ts
//
// DATA DE INICIO DAS ANALISES nas tools do MCP.
//
// Prova, tool a tool, os dois furos que existiam:
//   (a) SEM periodo informado, a tool varria o historico inteiro do cache (nenhum filtro de
//       data chegava na query);
//   (b) COM periodo anterior a data de inicio das analises, o valor do agente ia CRU para a
//       consulta, lendo documento que a plataforma declara nao analisar.
//
// Em ambos os casos a expectativa e a mesma: a query recebe o par completo, com o inicio
// grampeado no corte. E a resposta diz o periodo efetivamente coberto.

import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// Nenhum teste aqui chama getCorteDados, entao o corte vigente e o padrao do processo.
const CORTE = CORTE_DADOS_PADRAO; // 2026-03-16
const CORTE_DATE = new Date(`${CORTE}T00:00:00Z`);

// --- mocks das queries de src/ (o que interessa e o ARGUMENTO que a tool passa) ----------
jest.mock("@/lib/reports/queries/financeiro.js", () => ({
  queryCaixaPeriodo: jest.fn(async () => ({ entrada: 10, saida: 4, saldo: 6 })),
  queryFluxoCaixa: jest.fn(async () => ({ serie: [{ periodo: "2026-04", realizado: 1, previsto: 2 }] })),
}));
jest.mock("@/lib/reports/queries/financeiro-resultado.js", () => ({
  queryResultadoPorConta: jest.fn(async () => ({
    linhas: [{ contaNome: "Receita", natureza: "receita", total: 100, itens: 2 }],
    totalReceita: 100,
    totalDespesa: 40,
    resultado: 60,
  })),
}));
jest.mock("@/lib/reports/queries/comercial.js", () => ({
  queryPedidosPeriodo: jest.fn(async () => ({ totalPedidos: 3, valorTotal: 300 })),
  queryPedidosPorVendedor: jest.fn(async () => ({
    linhas: [{ vendedorNome: "Ana", quantidade: 2, valorTotal: 200 }],
  })),
}));
jest.mock("@/lib/reports/queries/estoque.js", () => ({
  queryEntradasSaidas: jest.fn(async () => ({ serie: [{ mes: "2026-04", entrada: 5, saida: 3 }] })),
  queryTopMovimentados: jest.fn(async () => ({
    kpis: { totalProdutos: 1, totalUnidades: 9 },
    linhas: [{ rotulo: "Esteira", valor: 9 }],
  })),
}));
jest.mock("@/lib/reports/queries/dfe.js", () => ({
  queryDfeImportadosPeriodo: jest.fn(async () => ({ linhas: [], totalNotas: 0, valorTotal: 0 })),
  queryDfePendentesManifestacao: jest.fn(async () => ({ linhas: [], totalPendentes: 0, valorTotal: 0 })),
  queryDfePorFornecedor: jest.fn(async () => ({
    linhas: [],
    totalAgregado: { quantidade: 0, valorTotal: 0 },
    totalFornecedoresDistintos: 0,
  })),
}));
jest.mock("@/lib/reports/queries/contabil.js", () => ({
  queryMovimentoConta: jest.fn(async () => ({ linhas: [], total: 0, truncado: false })),
  querySaldoConta: jest.fn(async () => ({ linhas: [], total: 0 })),
  queryResultadoPorNatureza: jest.fn(async () => ({
    linhas: [],
    receitaTotal: 0,
    despesaTotal: 0,
    resultado: 0,
  })),
  queryCentroCusto: jest.fn(async () => ({ linhas: [], total: 0 })),
  fatoContabilItemCount: jest.fn(async () => 0),
  mensagemContabilGestaoVazia: () => "sem lancamentos",
}));

import { queryCaixaPeriodo, queryFluxoCaixa } from "@/lib/reports/queries/financeiro.js";
import { queryResultadoPorConta } from "@/lib/reports/queries/financeiro-resultado.js";
import { queryPedidosPeriodo, queryPedidosPorVendedor } from "@/lib/reports/queries/comercial.js";
import { queryEntradasSaidas, queryTopMovimentados } from "@/lib/reports/queries/estoque.js";
import { queryDfeImportadosPeriodo } from "@/lib/reports/queries/dfe.js";
import { queryMovimentoConta, querySaldoConta } from "@/lib/reports/queries/contabil.js";

import { financeiroCaixaPeriodo } from "../financeiro/caixa-periodo.js";
import { financeiroFluxoCaixa } from "../financeiro/fluxo-caixa.js";
import { financeiroResultadoPorConta } from "../financeiro/resultado-por-conta.js";
import { financeiroLiquidez } from "../financeiro/liquidez.js";
import { financeiroAgingRecebiveis } from "../financeiro/aging-recebiveis.js";
import { comercialPedidosPeriodo } from "../comercial/pedidos-periodo.js";
import { comercialPedidosPorVendedor } from "../comercial/pedidos-por-vendedor.js";
import { comercialPedidosSemVendedor } from "../comercial/pedidos-sem-vendedor.js";
import { comercialVendedoresCadastrados } from "../comercial/vendedores-cadastrados.js";
import { comercialTempoMedioFechamento } from "../comercial/tempo-medio-fechamento.js";
import { comercialPedidosPorUf } from "../comercial/pedidos-por-uf.js";
import { estoqueEntradasSaidas } from "../estoque/entradas-saidas.js";
import { estoqueTopMovimentados } from "../estoque/top-movimentados.js";
import { contabilMovimentoConta } from "../contabil/movimento-conta.js";
import { contabilSaldoConta } from "../contabil/saldo-conta.js";
import { fiscalDfeImportadosPeriodo } from "../fiscal/dfe-importados-periodo.js";
import { fiscalNotasEmitidasPorCliente } from "../fiscal/notas-emitidas-por-cliente.js";
import { fiscalNotasEmitidasPorProduto } from "../fiscal/notas-emitidas-por-produto.js";

// --- prisma de mentira, so o suficiente para o withFreshness dizer "ok" ------------------
function makePrisma(extra: Record<string, unknown> = {}) {
  const AGORA = new Date("2026-07-12T10:00:00Z");
  return {
    fatoBuildState: {
      findMany: jest.fn(async () => [
        { fato: "fato_financeiro_movimento", ultimoBuildAt: AGORA },
        { fato: "fato_financeiro_titulo", ultimoBuildAt: AGORA },
        { fato: "fato_financeiro_saldo", ultimoBuildAt: AGORA },
        { fato: "fato_financeiro_lancamento_item", ultimoBuildAt: AGORA },
        { fato: "fato_pedido", ultimoBuildAt: AGORA },
        { fato: "fato_estoque_movimento", ultimoBuildAt: AGORA },
        { fato: "fato_contabil_lancamento_item", ultimoBuildAt: AGORA },
        { fato: "fato_dfe", ultimoBuildAt: AGORA },
        { fato: "fato_nota_fiscal", ultimoBuildAt: AGORA },
        { fato: "fato_nota_fiscal_item", ultimoBuildAt: AGORA },
        { fato: "fato_produto", ultimoBuildAt: AGORA },
        { fato: "fato_parceiro", ultimoBuildAt: AGORA },
      ]),
    },
    syncState: {
      findMany: jest.fn(async () => [
        { model: "x", lastStatus: "ok", lastSnapshotAt: AGORA, lastIncrementalAt: AGORA },
      ]),
    },
    ...extra,
  };
}

function ctxCom(extra: Record<string, unknown> = {}): ToolHandlerCtx {
  return {
    prisma: makePrisma(extra) as never,
    user: { userId: "u1", role: "admin", domains: ["financeiro", "comercial", "estoque", "contabil", "fiscal"] } as UserContext,
  };
}

/** Chamadas de um mock, sem a tipagem de tupla vazia que o jest.fn() sem generics produz. */
function chamadas(fn: unknown): unknown[][] {
  return (fn as jest.Mock).mock.calls as unknown[][];
}

beforeEach(() => jest.clearAllMocks());

describe("financeiro , piso da data de inicio das analises", () => {
  it("caixa_periodo SEM periodo: a query recebe o piso do corte (nao varre o cache)", async () => {
    await financeiroCaixaPeriodo.handler({}, ctxCom());
    expect(queryCaixaPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });

  it("caixa_periodo com periodo anterior ao corte: o inicio e grampeado", async () => {
    const r = await financeiroCaixaPeriodo.handler(
      { periodoDe: "2020-01-01", periodoAte: "2026-06-30" },
      ctxCom(),
    );
    expect(queryCaixaPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE, periodoAte: "2026-06-30" }),
    );
    if (r.estado !== "preparando") {
      expect(r.dados.periodoCoberto).toContain("16/03/2026");
    }
  });

  it("fluxo_caixa SEM periodo: serie mensal comeca no corte", async () => {
    await financeiroFluxoCaixa.handler({}, ctxCom());
    expect(queryFluxoCaixa).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });

  it("resultado_por_conta (DRE) SEM periodo: piso do corte", async () => {
    await financeiroResultadoPorConta.handler({}, ctxCom());
    expect(queryResultadoPorConta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });

  it("liquidez: as somas de titulo trazem o piso em data_documento (o saldo em caixa nao)", async () => {
    const $queryRaw = jest.fn(async () => [{ total: "0" }]);
    const ctx = ctxCom({ $queryRaw });
    await financeiroLiquidez.handler({}, ctx);
    const sqls = chamadas($queryRaw).map((c) => (c[0] as string[]).join("?"));
    const deTitulo = sqls.filter((s) => s.includes("fato_financeiro_titulo"));
    expect(deTitulo).toHaveLength(2);
    for (const s of deTitulo) expect(s).toContain("data_documento >=");
    // o corte vai como PARAMETRO do template (nunca interpolado)
    for (const call of chamadas($queryRaw)) {
      if ((call[0] as string[]).join("?").includes("fato_financeiro_titulo")) {
        expect(call[1]).toEqual(CORTE_DATE);
      }
    }
    // saldo em caixa e foto do agora: continua sem recorte de data
    const deSaldo = sqls.find((s) => s.includes("fato_financeiro_saldo"));
    expect(deSaldo).toBeDefined();
    expect(deSaldo).not.toContain("data_documento");
  });

  it("aging_recebiveis: o bucket 90+ nao conta mais divida anterior ao corte", async () => {
    const $queryRawUnsafe = jest.fn(async () => []);
    const ctx = ctxCom({ $queryRawUnsafe });
    await financeiroAgingRecebiveis.handler({}, ctx);
    expect(chamadas($queryRawUnsafe).length).toBeGreaterThanOrEqual(2);
    for (const call of chamadas($queryRawUnsafe)) {
      expect(String(call[0])).toContain("data_documento >= $2::date");
      expect(call[2]).toBe(CORTE);
    }
  });
});

describe("comercial , piso da data de inicio das analises", () => {
  it("pedidos_periodo SEM periodo: piso do corte", async () => {
    await comercialPedidosPeriodo.handler({}, ctxCom());
    expect(queryPedidosPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });

  it("pedidos_por_vendedor com periodo pre-corte: grampeia o inicio", async () => {
    await comercialPedidosPorVendedor.handler(
      { periodoDe: "2023-01-01", periodoAte: "2026-05-31" },
      ctxCom(),
    );
    expect(queryPedidosPorVendedor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE, periodoAte: "2026-05-31" }),
    );
  });

  it("pedidos_sem_vendedor SEM periodo: o where de dataOrcamento existe e comeca no corte", async () => {
    const fatoPedido = {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { vrNf: 0 } })),
    };
    await comercialPedidosSemVendedor.handler({}, ctxCom({ fatoPedido }));
    const where = (chamadas(fatoPedido.count)[0]![0] as { where: { dataOrcamento?: { gte?: Date } } })
      .where;
    expect(where.dataOrcamento?.gte).toEqual(CORTE_DATE);
  });

  it("vendedores_cadastrados: a contagem por vendedor respeita a janela de analise", async () => {
    const fatoPedido = { groupBy: jest.fn(async () => []) };
    await comercialVendedoresCadastrados.handler({}, ctxCom({ fatoPedido }));
    const arg = chamadas(fatoPedido.groupBy)[0]![0] as {
      where: { dataOrcamento?: { gte?: Date } };
    };
    expect(arg.where.dataOrcamento?.gte).toEqual(CORTE_DATE);
  });

  it("tempo_medio_fechamento SEM periodo: o BETWEEN de data continua no SQL (com o piso)", async () => {
    const $queryRawUnsafe = jest.fn(async () => [
      { total: BigInt(0), medio: 0, mediano: 0, minimo: 0, maximo: 0 },
    ]);
    await comercialTempoMedioFechamento.handler({}, ctxCom({ $queryRawUnsafe }));
    const [sql, p1] = chamadas($queryRawUnsafe)[0] as [string, string];
    expect(sql).toContain("data_orcamento BETWEEN $1::timestamp AND $2::timestamp");
    expect(p1).toBe(`${CORTE}T00:00:00`);
  });

  it("pedidos_por_uf SEM periodo: o filtro de data nao some do SQL", async () => {
    const $queryRawUnsafe = jest.fn(async () => []);
    await comercialPedidosPorUf.handler({}, ctxCom({ $queryRawUnsafe }));
    const [sql, p1] = chamadas($queryRawUnsafe)[0] as [string, string];
    expect(sql).toContain("pe.data_orcamento >= $1::timestamp");
    expect(p1).toBe(`${CORTE}T00:00:00`);
  });
});

describe("estoque , piso da data de inicio das analises", () => {
  it("entradas_saidas SEM periodo: a serie mensal comeca no corte", async () => {
    await estoqueEntradasSaidas.handler({}, ctxCom());
    expect(queryEntradasSaidas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });

  it("top_movimentados com periodo pre-corte: grampeia o inicio", async () => {
    await estoqueTopMovimentados.handler({ periodoDe: "2024-01-01" }, ctxCom());
    expect(queryTopMovimentados).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
  });
});

describe("contabil , piso da data de inicio das analises", () => {
  it("movimento_conta SEM periodo: o razao nao varre o cache inteiro", async () => {
    await contabilMovimentoConta.handler({ contaId: 1 } as never, ctxCom());
    expect(queryMovimentoConta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dataInicio: CORTE }),
    );
  });

  it("saldo_conta com dataInicio pre-corte: grampeia o inicio", async () => {
    await contabilSaldoConta.handler({ dataInicio: "2019-01-01" } as never, ctxCom());
    expect(querySaldoConta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dataInicio: CORTE }),
    );
  });
});

describe("fiscal , piso da data de inicio das analises", () => {
  it("dfe_importados_periodo SEM periodo: piso do corte e periodo declarado na resposta", async () => {
    const r = await fiscalDfeImportadosPeriodo.handler({}, ctxCom());
    expect(queryDfeImportadosPeriodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodoDe: CORTE }),
    );
    if (r.estado !== "preparando") {
      expect(r.dados.periodoCoberto).toContain("16/03/2026");
    }
  });

  it("notas_emitidas_por_cliente SEM periodo: o where de dataEmissao existe e comeca no corte", async () => {
    const fatoNotaFiscal = {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { vrNf: 0 } })),
    };
    await fiscalNotasEmitidasPorCliente.handler(
      { clienteTermo: "Smartfit" },
      ctxCom({ fatoNotaFiscal }),
    );
    const where = (
      chamadas(fatoNotaFiscal.count)[0]![0] as { where: { dataEmissao?: { gte?: Date } } }
    ).where;
    expect(where.dataEmissao?.gte).toEqual(CORTE_DATE);
  });

  it("notas_emitidas_por_produto SEM periodo: o BETWEEN de data continua no SQL", async () => {
    const $queryRawUnsafe = jest.fn(async () => []);
    await fiscalNotasEmitidasPorProduto.handler(
      { produtoTermo: "esteira" },
      ctxCom({ $queryRawUnsafe }),
    );
    const [sql, , p2] = chamadas($queryRawUnsafe)[0] as [string, string, string];
    expect(sql).toContain("nf.data_emissao BETWEEN $2::timestamp AND $3::timestamp");
    expect(p2).toBe(`${CORTE}T00:00:00`);
  });
});
