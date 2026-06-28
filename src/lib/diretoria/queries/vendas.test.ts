import { queryFormasPagamento } from "./vendas";

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
