// src/lib/reports/queries/comercial-cotacao.test.ts
//
// Comissão é lançamento vinculado a um PEDIDO (documento com data): a data de início
// das análises vale, e o piso vem do pedido pai (fato_comissao não tem data própria).
// Cotação: fato_cotacao NÃO tem coluna de data no cache , limite conhecido, sem piso
// possível hoje (ver comentário em comercial-cotacao.ts).
import { queryComissoes, queryCotacoes } from "./comercial-cotacao";
import type { PrismaClient } from "@/generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

const CORTE = corteAtualDate(); // padrão do processo: 2026-03-16

function mkPrisma(pedidosNoCorte: number[]): PrismaClient {
  return {
    fatoPedido: {
      findMany: jest.fn().mockResolvedValue(pedidosNoCorte.map((odooId) => ({ odooId }))),
    },
    fatoComissao: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    fatoCotacao: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaClient;
}

describe("queryComissoes", () => {
  it("CORTE: só considera comissões de pedidos dentro da janela de análise", async () => {
    const p = mkPrisma([10, 11]);
    await queryComissoes(p, {});

    const pedidoCall = (p.fatoPedido.findMany as jest.Mock).mock.calls[0][0];
    expect(pedidoCall.where?.dataOrcamento?.gte).toEqual(CORTE);

    const comissaoCall = (p.fatoComissao.findMany as jest.Mock).mock.calls[0][0];
    expect(comissaoCall.where?.pedidoId).toEqual({ in: [10, 11] });
  });

  it("CORTE: pedido pedido explícito fora da janela devolve conjunto vazio", async () => {
    const p = mkPrisma([10, 11]);
    await queryComissoes(p, { pedidoId: 99 }); // 99 é pré-corte (não está na lista)

    const comissaoCall = (p.fatoComissao.findMany as jest.Mock).mock.calls[0][0];
    expect(comissaoCall.where?.pedidoId).toEqual({ in: [] });
  });

  it("pedido dentro da janela é respeitado junto com os demais filtros", async () => {
    const p = mkPrisma([10, 11]);
    await queryComissoes(p, { pedidoId: 11, participanteId: 5 });

    const comissaoCall = (p.fatoComissao.findMany as jest.Mock).mock.calls[0][0];
    expect(comissaoCall.where?.pedidoId).toEqual({ in: [11] });
    expect(comissaoCall.where?.participanteId).toBe(5);
  });
});

describe("queryCotacoes", () => {
  it("limite conhecido: fato_cotacao não tem data no cache, então não há piso a aplicar", async () => {
    const p = mkPrisma([10]);
    await queryCotacoes(p, { status: "rascunho" });

    const call = (p.fatoCotacao.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ status: "rascunho" });
  });
});
