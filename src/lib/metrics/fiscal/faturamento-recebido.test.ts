import { faturamentoRecebido } from "./faturamento-recebido";
import type { PrismaClient } from "../../../generated/prisma/client";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

const CORTE = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`);

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

// Bug duplo do laudo: a funcao recebia periodoDe/periodoAte da tool e os IGNORAVA, somando o
// historico inteiro de lancamentos (respondia "recebido no periodo X" com o acumulado de sempre
// e sem o piso da data de inicio das analises). Lancamento financeiro e documento com data.
describe("faturamentoRecebido , data de inicio das analises", () => {
  function mock() {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrPagoTotal: 10, vrSaldo: 5 } });
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { fatoFinanceiroLancamentoItem: { aggregate, findMany } } as unknown as PrismaClient;
    return { prisma, aggregate, findMany };
  }

  it("respeita o periodo pedido (nao soma mais o historico inteiro)", async () => {
    const { prisma, aggregate, findMany } = mock();
    await faturamentoRecebido(prisma, { periodoDe: "2026-05-01", periodoAte: "2026-05-31" });

    const where = aggregate.mock.calls[0][0].where;
    expect(where.dataDocumento).toEqual({
      gte: new Date("2026-05-01T00:00:00Z"),
      lt: new Date("2026-06-01T00:00:00Z"), // borda exclusiva: o dia 31 entra inteiro
    });
    // a contagem de pedidos distintos usa o MESMO recorte
    expect(findMany.mock.calls[0][0].where.dataDocumento).toEqual(where.dataDocumento);
  });

  it("sem periodo: piso no corte (nunca varre o cache inteiro)", async () => {
    const { prisma, aggregate } = mock();
    await faturamentoRecebido(prisma, {});
    expect(aggregate.mock.calls[0][0].where.dataDocumento.gte).toEqual(CORTE);
  });

  it("periodo anterior ao corte: grampeia o inicio no corte", async () => {
    const { prisma, aggregate } = mock();
    await faturamentoRecebido(prisma, { periodoDe: "2024-01-01", periodoAte: "2026-06-30" });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.dataDocumento.gte).toEqual(CORTE);
    expect(where.dataDocumento.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("com empresaId, o recorte de data continua valendo junto do filtro de pedidos", async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { vrPagoTotal: 1, vrSaldo: 1 } });
    const liFindMany = jest.fn().mockResolvedValue([]);
    const pedidoFindMany = jest.fn().mockResolvedValue([{ odooId: 3 }]);
    const prisma = {
      fatoFinanceiroLancamentoItem: { aggregate, findMany: liFindMany },
      fatoPedido: { findMany: pedidoFindMany },
    } as unknown as PrismaClient;

    await faturamentoRecebido(prisma, { empresaId: 8, periodoDe: "2020-01-01" });

    const where = aggregate.mock.calls[0][0].where;
    expect(where.pedidoId).toEqual({ in: [3] });
    expect(where.dataDocumento.gte).toEqual(CORTE);
  });
});
