// src/lib/reports/queries/fiscal.ts
//
// Núcleo de agregação de fiscal, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_nota_fiscal (cabeçalho), fato_nota_fiscal_item (itens).

import type { PrismaClient } from "@/generated/prisma/client";

export async function queryFaturamentoPeriodo(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalNotas: number; valorFaturado: number }> {
  throw new Error("Not implemented");
}

export async function queryNotasEmitidas(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string; situacaoNfe?: string },
): Promise<{
  linhas: {
    numero: string | null;
    serie: string | null;
    dataEmissao: Date | null;
    situacaoNfe: string | null;
    participanteNome: string | null;
    vrNf: number;
  }[];
  totalNotas: number;
  valorTotal: number;
}> {
  throw new Error("Not implemented");
}

export async function queryNotasRecebidas(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{
  linhas: {
    numero: string | null;
    dataEmissao: Date | null;
    participanteNome: string | null;
    vrNf: number;
  }[];
  totalNotas: number;
  valorTotal: number;
}> {
  throw new Error("Not implemented");
}

export async function queryImpostosPeriodo(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalNotas: number; somaIbpt: number; somaIcmsProprio: number }> {
  throw new Error("Not implemented");
}

export async function queryFaturamentoPorCliente(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{
  linhas: { participanteNome: string | null; quantidade: number; valorTotal: number }[];
}> {
  throw new Error("Not implemented");
}

export async function queryProdutosFaturados(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string; limite?: number },
): Promise<{
  linhas: { produtoNome: string | null; quantidadeTotal: number; valorTotal: number }[];
}> {
  throw new Error("Not implemented");
}
