// src/lib/reports/queries/contabil.test.ts
import {
  queryPlanoDeContas,
  queryEstruturaConta,
  querySaldoConta,
  queryMovimentoConta,
  queryResultadoPorNatureza,
  queryCentroCusto,
  queryContaReferencial,
  fatoContabilItemCount,
  mensagemContabilGestaoVazia,
} from "./contabil";

// ---------------------------------------------------------------------------
// queryPlanoDeContas
// ---------------------------------------------------------------------------

describe("queryPlanoDeContas", () => {
  it("retorna todas as contas sem termo (até limite padrão) com total/truncado", async () => {
    const mockLinhas = [
      { odooId: 4, codigo: "1", nome: "ATIVO", tipo: "S", contaPaiNome: null },
      { odooId: 5, codigo: "1.1", nome: "ATIVO CIRCULANTE", tipo: "S", contaPaiNome: "1 - ATIVO [D]" },
    ];
    const prisma = {
      fatoContaContabil: {
        findMany: jest.fn().mockResolvedValue(mockLinhas),
        count: jest.fn().mockResolvedValue(2),
      },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    const result = await queryPlanoDeContas(prisma, {});
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas[0].odooId).toBe(4);
    expect(result.total).toBe(2);
    expect(result.truncado).toBe(false);
  });

  it("marca truncado=true quando total > linhas retornadas", async () => {
    const prisma = {
      fatoContaContabil: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 250 }, (_, i) => ({
            odooId: i, codigo: `c${i}`, nome: `Conta ${i}`, tipo: "A", contaPaiNome: null,
          })),
        ),
        count: jest.fn().mockResolvedValue(934),
      },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    const result = await queryPlanoDeContas(prisma, {});
    expect(result.linhas).toHaveLength(250);
    expect(result.total).toBe(934);
    expect(result.truncado).toBe(true);
  });

  it("aplica filtro por termo (where.OR presente) e limite customizado", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      fatoContaContabil: { findMany, count },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    await queryPlanoDeContas(prisma, { termo: "1.1", limite: 50 });
    const call = findMany.mock.calls[0][0];
    expect(call.where).toHaveProperty("OR");
    expect(call.take).toBe(50);
  });

  it("usa limite padrão 250 quando não informado", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      fatoContaContabil: { findMany, count },
    } as unknown as Parameters<typeof queryPlanoDeContas>[0];

    await queryPlanoDeContas(prisma, {});
    const call = findMany.mock.calls[0][0];
    expect(call.take).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// queryEstruturaConta
// ---------------------------------------------------------------------------

describe("queryEstruturaConta", () => {
  it("(a) conta com filhas , retorna conta + filhas", async () => {
    const contaMock = { odooId: 5, codigo: "1.1", nome: "ATIVO CIRCULANTE", tipo: "S", contaPaiNome: "1 - ATIVO [D]" };
    const filhasMock = [{ odooId: 100, codigo: "1.1.1", nome: "CAIXA", tipo: "A" }];
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(contaMock),
        findMany: jest.fn().mockResolvedValue(filhasMock),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 5 });
    expect(result.conta).not.toBeNull();
    expect(result.conta?.odooId).toBe(5);
    expect(result.conta?.contaPaiNome).toBe("1 - ATIVO [D]");
    expect(result.filhas).toHaveLength(1);
    expect(result.filhas[0].odooId).toBe(100);
  });

  it("(b) conta folha sem filhas , retorna conta + filhas vazio, estado ok", async () => {
    const contaMock = { odooId: 100, codigo: "1.1.1", nome: "CAIXA", tipo: "A", contaPaiNome: "ATIVO CIRCULANTE" };
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(contaMock),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 100 });
    expect(result.conta).not.toBeNull();
    expect(result.filhas).toHaveLength(0);
  });

  it("(c) conta inexistente , conta null, filhas vazio", async () => {
    const prisma = {
      fatoContaContabil: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof queryEstruturaConta>[0];

    const result = await queryEstruturaConta(prisma, { odooId: 9999 });
    expect(result.conta).toBeNull();
    expect(result.filhas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B1 (onda contábil , movimento): saldo / razão / resultado / centro de custo
// ---------------------------------------------------------------------------

describe("mensagemContabilGestaoVazia", () => {
  it("fato globalmente vazio (0 itens) , mensagem de 'não operado'", () => {
    expect(mensagemContabilGestaoVazia(0)).toMatch(/ainda não é operada/i);
  });
  it("fato com dados mas recorte vazio , mensagem de 'recorte sem lançamentos'", () => {
    expect(mensagemContabilGestaoVazia(42)).toMatch(/nesse recorte/i);
  });
});

describe("fatoContabilItemCount", () => {
  it("retorna o count do fato de itens", async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoContabilLancamentoItem: { count } } as unknown as Parameters<typeof fatoContabilItemCount>[0];
    expect(await fatoContabilItemCount(prisma)).toBe(0);
    expect(count).toHaveBeenCalledTimes(1);
  });
});

describe("querySaldoConta", () => {
  it("fato vazio , retorna linhas vazias e total 0", async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = { fatoContabilLancamentoItem: { groupBy } } as unknown as Parameters<typeof querySaldoConta>[0];
    const result = await querySaldoConta(prisma, {});
    expect(result.linhas).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(groupBy.mock.calls[0][0].take).toBe(250);
  });

  it("calcula saldo = débito − crédito por conta", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { contaId: 10, contaCodigo: "1.1.1", contaNome: "CAIXA", contaNatureza: "01", _sum: { valorDebito: 1000, valorCredito: 300 } },
      { contaId: 20, contaCodigo: "2.1.1", contaNome: "FORNECEDORES", contaNatureza: "02", _sum: { valorDebito: 50, valorCredito: 500 } },
    ]);
    const prisma = { fatoContabilLancamentoItem: { groupBy } } as unknown as Parameters<typeof querySaldoConta>[0];
    const result = await querySaldoConta(prisma, {});
    expect(result.linhas[0].saldo).toBe(700);
    expect(result.linhas[1].saldo).toBe(-450);
    expect(result.total).toBe(2);
  });

  it("aplica filtro por termo (where.OR) e período (dataLancamento) e limite", async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = { fatoContabilLancamentoItem: { groupBy } } as unknown as Parameters<typeof querySaldoConta>[0];
    await querySaldoConta(prisma, { termo: "caixa", dataInicio: "2026-01-01", dataFim: "2026-12-31", limite: 10 });
    const call = groupBy.mock.calls[0][0];
    expect(call.where).toHaveProperty("OR");
    expect(call.where.dataLancamento).toEqual({ gte: new Date("2026-01-01"), lte: new Date("2026-12-31") });
    expect(call.take).toBe(10);
  });

  it("trata _sum null como 0", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { contaId: 10, contaCodigo: "1", contaNome: "X", contaNatureza: "01", _sum: { valorDebito: null, valorCredito: null } },
    ]);
    const prisma = { fatoContabilLancamentoItem: { groupBy } } as unknown as Parameters<typeof querySaldoConta>[0];
    const result = await querySaldoConta(prisma, {});
    expect(result.linhas[0].saldo).toBe(0);
  });
});

describe("queryMovimentoConta", () => {
  it("razão por contaId , findMany com where.contaId e count, truncado correto", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { odooId: 1, lancamentoId: 7, dataLancamento: new Date("2026-03-01"), contaCodigo: "1.1.1", contaNome: "CAIXA", centroCustoNome: null, historico: "venda", valorDebito: 100, valorCredito: 0 },
    ]);
    const count = jest.fn().mockResolvedValue(5);
    const prisma = { fatoContabilLancamentoItem: { findMany, count } } as unknown as Parameters<typeof queryMovimentoConta>[0];
    const result = await queryMovimentoConta(prisma, { contaId: 10, limite: 1 });
    expect(findMany.mock.calls[0][0].where.contaId).toBe(10);
    expect(result.linhas[0].debito).toBe(100);
    expect(result.total).toBe(5);
    expect(result.truncado).toBe(true);
  });

  it("aceita contaCodigo quando contaId ausente", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoContabilLancamentoItem: { findMany, count } } as unknown as Parameters<typeof queryMovimentoConta>[0];
    await queryMovimentoConta(prisma, { contaCodigo: "1.1.1" });
    expect(findMany.mock.calls[0][0].where.contaCodigo).toBe("1.1.1");
    expect(findMany.mock.calls[0][0].where.contaId).toBeUndefined();
  });
});

describe("queryResultadoPorNatureza", () => {
  it("filtra natureza 04 e exclui Encerramento (NOT lancamentoTipo=E)", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { valorCredito: 0, valorDebito: 0 } });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoContabilLancamentoItem: { aggregate, count } } as unknown as Parameters<typeof queryResultadoPorNatureza>[0];
    const result = await queryResultadoPorNatureza(prisma, {});
    const where = aggregate.mock.calls[0][0].where;
    expect(where.contaNatureza).toBe("04");
    expect(where.NOT).toEqual({ lancamentoTipo: "E" });
    expect(result.linhas).toHaveLength(0); // 0 itens → vazio
  });

  it("crédito=receita, débito=despesa, resultado=receita−despesa", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { valorCredito: 10000, valorDebito: 6000 } });
    const count = jest.fn().mockResolvedValue(12);
    const prisma = { fatoContabilLancamentoItem: { aggregate, count } } as unknown as Parameters<typeof queryResultadoPorNatureza>[0];
    const result = await queryResultadoPorNatureza(prisma, {});
    expect(result.receitaTotal).toBe(10000);
    expect(result.despesaTotal).toBe(6000);
    expect(result.resultado).toBe(4000);
    expect(result.linhas[0].resultado).toBe(4000);
  });
});

describe("queryCentroCusto", () => {
  it("agrupa por centro de custo e calcula saldo, ignorando centro nulo (where.centroCustoId not null)", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { centroCustoId: 3, centroCustoNome: "Logística", _sum: { valorDebito: 800, valorCredito: 200 } },
    ]);
    const prisma = { fatoContabilLancamentoItem: { groupBy } } as unknown as Parameters<typeof queryCentroCusto>[0];
    const result = await queryCentroCusto(prisma, {});
    expect(groupBy.mock.calls[0][0].where.centroCustoId).toEqual({ not: null });
    expect(result.linhas[0].saldo).toBe(600);
    expect(result.total).toBe(1);
  });
});

describe("queryContaReferencial", () => {
  it("DADO REAL: filtra por natureza, ordena por código, total/truncado", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { odooId: 1, codigo: "1", nome: "ATIVO", natureza: "01", nivel: 1 },
      { odooId: 2, codigo: "1.01", nome: "ATIVO CIRCULANTE", natureza: "01", nivel: 2 },
    ]);
    const count = jest.fn().mockResolvedValue(948);
    const prisma = { fatoContabilContaReferencial: { findMany, count } } as unknown as Parameters<typeof queryContaReferencial>[0];
    const result = await queryContaReferencial(prisma, { natureza: "01" });
    expect(findMany.mock.calls[0][0].where.natureza).toBe("01");
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ codigo: "asc" });
    expect(result.linhas).toHaveLength(2);
    expect(result.total).toBe(948);
    expect(result.truncado).toBe(true);
  });

  it("aplica termo (where.OR) e limite custom", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoContabilContaReferencial: { findMany, count } } as unknown as Parameters<typeof queryContaReferencial>[0];
    await queryContaReferencial(prisma, { termo: "caixa", limite: 5 });
    expect(findMany.mock.calls[0][0].where).toHaveProperty("OR");
    expect(findMany.mock.calls[0][0].take).toBe(5);
  });
});
