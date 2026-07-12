// src/lib/reports/queries/cobranca-bancaria.test.ts
//
// Regra em teste: baixa, retorno, remessa, cheque e PIX são eventos financeiros
// DATADOS (histórico), então toda leitura respeita a data de início das análises
// (AppSetting sync.corte_dados). Sem período, o piso é o corte , nunca o cache inteiro.
// Carteira de cobrança é cadastro (sem data): fica de fora da regra, de propósito.
import {
  queryBaixasCobranca,
  queryRetornosProcessados,
  queryRemessasGeradas,
  queryCheques,
  queryPixRecebidos,
  queryCarteirasCobranca,
} from "./cobranca-bancaria";
import type { PrismaClient } from "@/generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

const CORTE = corteAtualDate(); // padrão do processo: 2026-03-16

function mkPrisma(modelo: string): PrismaClient {
  return {
    [modelo]: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaClient;
}
function whereDaChamada(p: PrismaClient, modelo: string): Record<string, { gte?: Date; lt?: Date }> {
  const m = (p as unknown as Record<string, { findMany: jest.Mock }>)[modelo]!;
  return m.findMany.mock.calls[0]![0].where;
}

describe("cobrança bancária , piso da data de início das análises", () => {
  it("queryBaixasCobranca: sem período, o piso é o corte (não varre todas as baixas)", async () => {
    const p = mkPrisma("fatoRetornoItem");
    await queryBaixasCobranca(p, { limit: 10, offset: 0 });
    const where = whereDaChamada(p, "fatoRetornoItem");
    expect(where.dataPagamento?.gte).toEqual(CORTE);
  });

  it("queryBaixasCobranca: período pré-corte é grampeado e o último dia entra inteiro", async () => {
    const p = mkPrisma("fatoRetornoItem");
    await queryBaixasCobranca(p, {
      periodoDe: "2023-01-01",
      periodoAte: "2026-04-30",
      limit: 10,
      offset: 0,
    });
    const where = whereDaChamada(p, "fatoRetornoItem");
    expect(where.dataPagamento?.gte).toEqual(CORTE);
    expect(where.dataPagamento?.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("queryBaixasCobranca: período dentro da janela passa intacto", async () => {
    const p = mkPrisma("fatoRetornoItem");
    await queryBaixasCobranca(p, {
      periodoDe: "2026-04-01",
      periodoAte: "2026-04-30",
      limit: 10,
      offset: 0,
    });
    const where = whereDaChamada(p, "fatoRetornoItem");
    expect(where.dataPagamento?.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
  });

  it("queryRetornosProcessados: sem período, o piso é o corte", async () => {
    const p = mkPrisma("fatoRetornoBancario");
    await queryRetornosProcessados(p, { limit: 10, offset: 0 });
    expect(whereDaChamada(p, "fatoRetornoBancario").data?.gte).toEqual(CORTE);
  });

  it("queryRemessasGeradas: sem período, o piso é o corte", async () => {
    const p = mkPrisma("fatoRemessaBancaria");
    await queryRemessasGeradas(p, { limit: 10, offset: 0 });
    expect(whereDaChamada(p, "fatoRemessaBancaria").data?.gte).toEqual(CORTE);
  });

  it("queryCheques: sem período, o piso é o corte", async () => {
    const p = mkPrisma("fatoCheque");
    await queryCheques(p, { limit: 10, offset: 0 });
    expect(whereDaChamada(p, "fatoCheque").data?.gte).toEqual(CORTE);
  });

  it("queryPixRecebidos: período pré-corte é grampeado", async () => {
    const p = mkPrisma("fatoPix");
    await queryPixRecebidos(p, { periodoDe: "2020-01-01", limit: 10, offset: 0 });
    expect(whereDaChamada(p, "fatoPix").data?.gte).toEqual(CORTE);
  });

  it("queryCarteirasCobranca: cadastro (sem data) , continua sem recorte de período", async () => {
    const p = mkPrisma("fatoCarteiraCobranca");
    await queryCarteirasCobranca(p, { limit: 10, offset: 0 });
    const call = (p as unknown as Record<string, { findMany: jest.Mock }>).fatoCarteiraCobranca!
      .findMany.mock.calls[0]![0];
    expect(call.where).toBeUndefined();
  });
});
