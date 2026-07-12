import { CORTE_DADOS_PADRAO, corteAtualDate } from "@/lib/corte-dados";

import {
  queryFormasPagamento,
  queryVendasPorMarca,
  queryVendasPorUf,
  queryModalidadesEMaiorPedido,
  queryIndicadoresVendas,
  queryMargemEstimada,
} from "./vendas";

/** Data de início das análises vigente nos testes (nenhum getCorteDados foi chamado). */
const CORTE = corteAtualDate();

function makePrisma(
  parcelas: { formaPagamentoNome: string | null; valor: number }[],
  pedidos: { odooId: number }[] = [{ odooId: 1 }, { odooId: 2 }, { odooId: 3 }],
) {
  return {
    fatoPedido: { findMany: jest.fn().mockResolvedValue(pedidos) },
    fatoPedidoParcela: {
      findMany: jest.fn().mockResolvedValue(parcelas),
    },
  } as unknown as Parameters<typeof queryFormasPagamento>[0];
}

describe("queryFormasPagamento (C10)", () => {
  it("agrega valor por forma de pagamento, ordenado por valor desc", async () => {
    const prisma = makePrisma([
      { formaPagamentoNome: "Boleto", valor: 100 },
      { formaPagamentoNome: "Pix", valor: 300 },
      { formaPagamentoNome: "Boleto", valor: 50 },
    ]);
    const r = await queryFormasPagamento(prisma, {});
    expect(r.valorGeral).toBe(450);
    expect(r.linhas[0]).toEqual({ formaPagamento: "Pix", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ formaPagamento: "Boleto", quantidade: 2, valorTotal: 150 });
  });

  it("parcela sem forma vira 'Não informado'", async () => {
    const prisma = makePrisma([{ formaPagamentoNome: null, valor: 10 }]);
    const r = await queryFormasPagamento(prisma, {});
    expect(r.linhas[0].formaPagamento).toBe("Não informado");
  });

  it("período filtra por dataVencimento, com o último dia inteiro (borda exclusiva)", async () => {
    const prisma = makePrisma([]);
    await queryFormasPagamento(prisma, { periodoDe: "2026-06-01", periodoAte: "2026-06-30" });
    const call = (prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataVencimento.gte).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(call.where.dataVencimento.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("sem período, o piso é a data de início das análises (não varre o histórico inteiro)", async () => {
    const prisma = makePrisma([]);
    await queryFormasPagamento(prisma, {});
    const call = (prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataVencimento.gte).toEqual(CORTE);
  });

  it("período anterior ao corte é grampeado na data de início das análises", async () => {
    const prisma = makePrisma([]);
    await queryFormasPagamento(prisma, { periodoDe: "2024-01-01", periodoAte: "2026-06-30" });
    const call = (prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataVencimento.gte).toEqual(CORTE);
  });

  it("só conta parcela de pedido posterior ao corte (o piso é do DOCUMENTO, não do vencimento)", async () => {
    const prisma = makePrisma([{ formaPagamentoNome: "Pix", valor: 10 }], [{ odooId: 7 }]);
    await queryFormasPagamento(prisma, { periodoDe: "2026-06-01", periodoAte: "2026-06-30" });
    const pedidoCall = (prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(pedidoCall.where.dataOrcamento.gte).toEqual(CORTE);
    const parcelaCall = (prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(parcelaCall.where.pedidoId).toEqual({ in: [7] });
  });
});

function makePrismaMarca(
  itens: { produtoId: number | null; vrProdutos: number }[],
  produtos: { odooId: number; marcaNome: string | null }[],
  notasVe: { odooId: number }[] = [{ odooId: 10 }, { odooId: 20 }],
) {
  return {
    fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue(notasVe) },
    fatoNotaFiscalItem: { findMany: jest.fn().mockResolvedValue(itens) },
    fatoProduto: { findMany: jest.fn().mockResolvedValue(produtos) },
  } as unknown as Parameters<typeof queryVendasPorMarca>[0];
}

describe("queryVendasPorMarca (C4)", () => {
  it("agrega valor por marca via join produto", async () => {
    const prisma = makePrismaMarca(
      [
        { produtoId: 1, vrProdutos: 100 },
        { produtoId: 2, vrProdutos: 300 },
        { produtoId: 1, vrProdutos: 50 },
      ],
      [
        { odooId: 1, marcaNome: "Matrix" },
        { odooId: 2, marcaNome: "LifeFitness" },
      ],
    );
    const r = await queryVendasPorMarca(prisma, {});
    expect(r.valorGeral).toBe(450);
    expect(r.linhas[0]).toEqual({ marca: "LifeFitness", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ marca: "Matrix", quantidade: 2, valorTotal: 150 });
  });

  it("item sem produto ou marca vira 'Sem marca'", async () => {
    const prisma = makePrismaMarca(
      [{ produtoId: null, vrProdutos: 10 }],
      [],
    );
    const r = await queryVendasPorMarca(prisma, {});
    expect(r.linhas[0].marca).toBe("Sem marca");
  });

  it("restringe a venda externa: busca ids de nota (is_venda_externa) e filtra itens por documentoId", async () => {
    const prisma = makePrismaMarca([{ produtoId: 1, vrProdutos: 100 }], [{ odooId: 1, marcaNome: "Matrix" }], [{ odooId: 10 }, { odooId: 20 }]);
    await queryVendasPorMarca(prisma, {});
    const notaCall = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(notaCall.where.isVendaExterna).toBe(true);
    const itemCall = (prisma.fatoNotaFiscalItem.findMany as jest.Mock).mock.calls[0][0];
    expect(itemCall.where.documentoId).toEqual({ in: [10, 20] });
  });
});

function makePrismaUf(
  notas: { participanteId: number | null; vrNf: number }[],
  parceiros: { odooId: number; uf: string | null }[],
) {
  return {
    fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue(notas) },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue(parceiros) },
  } as unknown as Parameters<typeof queryVendasPorUf>[0];
}

describe("queryVendasPorUf (C3)", () => {
  it("agrega valor por UF via join parceiro", async () => {
    const prisma = makePrismaUf(
      [
        { participanteId: 1, vrNf: 100 },
        { participanteId: 2, vrNf: 300 },
        { participanteId: 1, vrNf: 50 },
      ],
      [
        { odooId: 1, uf: "SP" },
        { odooId: 2, uf: "MG" },
      ],
    );
    const r = await queryVendasPorUf(prisma, {});
    expect(r.valorGeral).toBe(450);
    expect(r.linhas[0]).toEqual({ uf: "MG", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ uf: "SP", quantidade: 2, valorTotal: 150 });
  });

  it("respeita o UF-scoping (só agrega as UFs permitidas)", async () => {
    const prisma = makePrismaUf(
      [
        { participanteId: 1, vrNf: 100 },
        { participanteId: 2, vrNf: 300 },
      ],
      [
        { odooId: 1, uf: "SP" },
        { odooId: 2, uf: "MG" },
      ],
    );
    const r = await queryVendasPorUf(prisma, { ufs: ["SP"] });
    expect(r.valorGeral).toBe(100);
    expect(r.linhas).toEqual([{ uf: "SP", quantidade: 1, valorTotal: 100 }]);
  });

  it("filtra só venda externa (is_venda_externa) no where", async () => {
    const prisma = makePrismaUf([], []);
    await queryVendasPorUf(prisma, {});
    const call = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.isVendaExterna).toBe(true);
  });
});

function makePrismaPedidos(
  pedidos: {
    operacaoNome: string | null;
    vrProdutos: number;
    numero: string | null;
    participanteNome: string | null;
  }[],
) {
  return {
    fatoPedido: { findMany: jest.fn().mockResolvedValue(pedidos) },
  } as unknown as Parameters<typeof queryModalidadesEMaiorPedido>[0];
}

describe("queryModalidadesEMaiorPedido (C6)", () => {
  it("agrupa por modalidade e acha o maior pedido", async () => {
    const prisma = makePrismaPedidos([
      { operacaoNome: "Presencial", vrProdutos: 100, numero: "P1", participanteNome: "Cliente A" },
      { operacaoNome: "Online", vrProdutos: 500, numero: "P2", participanteNome: "Cliente B" },
      { operacaoNome: "Presencial", vrProdutos: 200, numero: "P3", participanteNome: "Cliente C" },
    ]);
    const r = await queryModalidadesEMaiorPedido(prisma, {});
    // ordenado por valorTotal desc: Online (500) antes de Presencial (300)
    expect(r.modalidades[0]).toEqual({ modalidade: "Online", quantidade: 1, valorTotal: 500 });
    expect(r.modalidades[1]).toEqual({ modalidade: "Presencial", quantidade: 2, valorTotal: 300 });
    expect(r.maiorPedido).toEqual({ numero: "P2", participante: "Cliente B", valor: 500 });
  });

  it("pedido sem operação vira 'Outras' e lista vazia não tem maior pedido", async () => {
    const semOp = makePrismaPedidos([
      { operacaoNome: null, vrProdutos: 10, numero: "X", participanteNome: null },
    ]);
    expect((await queryModalidadesEMaiorPedido(semOp, {})).modalidades[0].modalidade).toBe("Outras");
    const vazio = makePrismaPedidos([]);
    expect((await queryModalidadesEMaiorPedido(vazio, {})).maiorPedido).toBeNull();
  });
});

describe("queryIndicadoresVendas (C2)", () => {
  it("calcula faturamento, nº de pedidos e ticket médio", async () => {
    const prisma = {
      fatoNotaFiscal: {
        findMany: jest.fn().mockResolvedValue([{ vrNf: 1000 }, { vrNf: 500 }]),
      },
      fatoPedido: { count: jest.fn().mockResolvedValue(3) },
    } as unknown as Parameters<typeof queryIndicadoresVendas>[0];
    const r = await queryIndicadoresVendas(prisma, {});
    expect(r.faturamento).toBe(1500);
    expect(r.numPedidos).toBe(3);
    expect(r.ticketMedio).toBe(500);
  });

  it("ticket médio é 0 quando não há pedidos", async () => {
    const prisma = {
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
      fatoPedido: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as Parameters<typeof queryIndicadoresVendas>[0];
    const r = await queryIndicadoresVendas(prisma, {});
    expect(r.ticketMedio).toBe(0);
  });
});

describe("queryMargemEstimada (margem aproximada)", () => {
  it("calcula margem = receita - custo (preco_custo x qtd)", async () => {
    const prisma = {
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([{ odooId: 10 }]) },
      fatoNotaFiscalItem: {
        findMany: jest.fn().mockResolvedValue([
          { produtoId: 1, vrProdutos: 1000, quantidade: 2 },
          { produtoId: 2, vrProdutos: 500, quantidade: 1 },
        ]),
      },
      fatoProduto: {
        findMany: jest.fn().mockResolvedValue([
          { odooId: 1, precoCusto: 300 }, // custo 300*2 = 600
          { odooId: 2, precoCusto: 100 }, // custo 100*1 = 100
        ]),
      },
    } as unknown as Parameters<typeof queryMargemEstimada>[0];
    const r = await queryMargemEstimada(prisma, {});
    expect(r.receita).toBe(1500);
    expect(r.custoEstimado).toBe(700);
    expect(r.margem).toBe(800);
    expect(Math.round(r.margemPct)).toBe(53);
  });
});

// Nota fiscal e pedido são documentos com data: o piso da data de início das análises vale
// SEMPRE, inclusive quando o chamador não manda período (o caso do construtor).
describe("data de início das análises nas queries de vendas", () => {
  it("queryVendasPorUf sem período: piso no corte, nunca where vazio", async () => {
    const prisma = makePrismaUf([], []);
    await queryVendasPorUf(prisma, {});
    const call = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(CORTE);
  });

  it("queryVendasPorMarca com período pré-corte: dataEmissao grampeada", async () => {
    const prisma = makePrismaMarca([], []);
    await queryVendasPorMarca(prisma, { periodoDe: "2020-01-01", periodoAte: "2026-06-30" });
    const call = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(CORTE);
    expect(call.where.dataEmissao.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("queryModalidadesEMaiorPedido sem período: piso no corte em dataOrcamento", async () => {
    const prisma = makePrismaPedidos([]);
    await queryModalidadesEMaiorPedido(prisma, {});
    const call = (prisma.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataOrcamento.gte).toEqual(CORTE);
  });

  it("queryIndicadoresVendas sem período: nota e pedido com piso no corte", async () => {
    const prisma = {
      fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue([]) },
      fatoPedido: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as Parameters<typeof queryIndicadoresVendas>[0];
    await queryIndicadoresVendas(prisma, {});
    const nota = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    const pedido = (prisma.fatoPedido.count as jest.Mock).mock.calls[0][0];
    expect(nota.where.dataEmissao.gte).toEqual(CORTE);
    expect(pedido.where.dataOrcamento.gte).toEqual(CORTE);
  });

  it("o corte usado é o configurado na plataforma (default 2026-03-16)", () => {
    expect(CORTE).toEqual(new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`));
  });
});
