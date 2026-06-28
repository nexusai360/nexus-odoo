import {
  queryFormasPagamento,
  queryVendasPorMarca,
  queryVendasPorUf,
  queryModalidadesEMaiorPedido,
} from "./vendas";

function makePrisma(parcelas: { formaPagamentoNome: string | null; valor: number }[]) {
  return {
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

  it("período filtra por dataVencimento (passa where ao prisma)", async () => {
    const prisma = makePrisma([]);
    await queryFormasPagamento(prisma, { periodoDe: "2026-06-01", periodoAte: "2026-06-30" });
    const call = (prisma.fatoPedidoParcela.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataVencimento.gte).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(call.where.dataVencimento.lte).toEqual(new Date("2026-06-30T23:59:59Z"));
  });
});

function makePrismaMarca(
  itens: { produtoId: number | null; vrProdutos: number }[],
  produtos: { odooId: number; marcaNome: string | null }[],
) {
  return {
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

  it("filtra itens de saída (entradaSaida=1) no where", async () => {
    const prisma = makePrismaMarca([], []);
    await queryVendasPorMarca(prisma, {});
    const call = (prisma.fatoNotaFiscalItem.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.entradaSaida).toBe("1");
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

  it("filtra notas de saída autorizadas no where", async () => {
    const prisma = makePrismaUf([], []);
    await queryVendasPorUf(prisma, {});
    const call = (prisma.fatoNotaFiscal.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.entradaSaida).toBe("1");
    expect(call.where.situacaoNfe).toBe("autorizada");
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
