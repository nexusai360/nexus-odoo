import { faturamentoRecebido } from "./faturamento-recebido";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoRecebido", () => {
  it("entrega recebido/aReceber por pedido (elo direto) e marca gap no eixo nota", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrPagoTotal: 6452439.44, vrSaldo: 26923169.53 } });
    const findMany = jest.fn().mockResolvedValue([{ pedidoId: 1 }, { pedidoId: 2 }]);
    const prisma = { fatoFinanceiroLancamentoItem: { aggregate, findMany } } as unknown as PrismaClient;

    const r = await faturamentoRecebido(prisma, {});

    expect(r.disponivelPorPedido).toBe(true);
    expect(r.disponivelPorNota).toBe(false);
    expect(r.recebido).toBe(6452439.44);
    expect(r.aReceber).toBe(26923169.53);
    expect(r.pedidosComLancamento).toBe(2);
    expect(r.gapNota).toMatch(/nota/i);
    const where = aggregate.mock.calls[0][0].where;
    expect(where.pedidoId).toEqual({ not: null });
  });

  it("com empresaId filtra pelos pedidos da empresa", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrPagoTotal: 100, vrSaldo: 50 } });
    const liFindMany = jest.fn().mockResolvedValue([{ pedidoId: 1 }]);
    const pedidoFindMany = jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]);
    const prisma = {
      fatoFinanceiroLancamentoItem: { aggregate, findMany: liFindMany },
      fatoPedido: { findMany: pedidoFindMany },
    } as unknown as PrismaClient;

    const r = await faturamentoRecebido(prisma, { empresaId: 8 });

    expect(pedidoFindMany).toHaveBeenCalledWith({ where: { empresaId: 8 }, select: { odooId: true } });
    expect(aggregate.mock.calls[0][0].where.pedidoId).toEqual({ in: [1, 2] });
    expect(r.recebido).toBe(100);
  });
});
