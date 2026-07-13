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
  titulos: {
    notaFiscalId: number | null;
    vrSaldo: number;
    vrDocumento: number;
    formaPagamentoNome: string | null;
    provisorio?: boolean;
    participanteId?: number | null;
  }[],
) {
  return {
    fatoFinanceiroTitulo: {
      findMany: jest.fn().mockResolvedValue(
        titulos.map((t) => ({
          provisorio: false,
          participanteId: null,
          ...t,
        })),
      ),
    },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as Parameters<typeof queryFormasPagamento>[0];
}

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

describe("queryFormasPagamento (C-07)", () => {
  // A consulta lia a PARCELA do pedido, onde a forma de pagamento e opcional e vinha
  // vazia em 24% dos casos , dai um balde "Nao informado" de R$ 23 mi. Agora le o TITULO
  // financeiro, o documento de cobranca de verdade, onde ela esta preenchida em 99,98%.
  it("separa o que foi pago, o que ainda vai vencer e o que nem virou nota", async () => {
    const prisma = makePrisma([
      // nota emitida e titulo quitado -> a receita que entrou
      { notaFiscalId: 10, vrSaldo: 0, vrDocumento: 1000, formaPagamentoNome: "Boleto" },
      // nota emitida, parcela ainda a vencer
      { notaFiscalId: 11, vrSaldo: 500, vrDocumento: 500, formaPagamentoNome: "PIX" },
      // sem nota: pedido fechado, nota ainda nao saiu
      { notaFiscalId: null, vrSaldo: 300, vrDocumento: 300, formaPagamentoNome: "Boleto" },
    ]);

    const r = await queryFormasPagamento(prisma, {});

    expect(r.pago.valorGeral).toBe(1000);
    expect(r.pago.linhas).toEqual([
      { formaPagamento: "Boleto", quantidade: 1, valorTotal: 1000 },
    ]);
    expect(r.a_receber.valorGeral).toBe(500);
    expect(r.carteira.valorGeral).toBe(300);
  });

  it("agrupa por forma dentro de cada visao, ordenado por valor", async () => {
    const prisma = makePrisma([
      { notaFiscalId: 1, vrSaldo: 0, vrDocumento: 100, formaPagamentoNome: "Boleto" },
      { notaFiscalId: 2, vrSaldo: 0, vrDocumento: 300, formaPagamentoNome: "PIX" },
      { notaFiscalId: 3, vrSaldo: 0, vrDocumento: 50, formaPagamentoNome: "Boleto" },
    ]);

    const r = await queryFormasPagamento(prisma, {});

    expect(r.pago.linhas).toEqual([
      { formaPagamento: "PIX", quantidade: 1, valorTotal: 300 },
      { formaPagamento: "Boleto", quantidade: 2, valorTotal: 150 },
    ]);
    expect(r.pago.titulos).toBe(3);
  });

  it("titulo sem forma cadastrada vira 'Nao informado' (residuo real, nao escondido)", async () => {
    const prisma = makePrisma([
      { notaFiscalId: 1, vrSaldo: 0, vrDocumento: 80, formaPagamentoNome: null },
    ]);

    const r = await queryFormasPagamento(prisma, {});

    expect(r.pago.linhas).toEqual([
      { formaPagamento: "Não informado", quantidade: 1, valorTotal: 80 },
    ]);
  });

  it("conta os titulos ainda provisorios no Odoo", async () => {
    const prisma = makePrisma([
      { notaFiscalId: 1, vrSaldo: 0, vrDocumento: 10, formaPagamentoNome: "Boleto", provisorio: true },
      { notaFiscalId: 2, vrSaldo: 0, vrDocumento: 10, formaPagamentoNome: "Boleto" },
    ]);

    const r = await queryFormasPagamento(prisma, {});

    expect(r.pago.provisorios).toBe(1);
  });

  it("le o titulo a receber, recortado pela data do documento", async () => {
    const prisma = makePrisma([]);

    await queryFormasPagamento(prisma, {});

    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.tipo).toBe("a_receber");
    // Recorte pela data do DOCUMENTO, nao pelo vencimento: e a unica combinacao que
    // reproduz os numeros conferidos contra o cache real.
    expect(call.where.dataDocumento).toBeDefined();
  });
});

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
