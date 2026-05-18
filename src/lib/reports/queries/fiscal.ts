// src/lib/reports/queries/fiscal.ts
//
// Núcleo de agregação de fiscal, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_nota_fiscal (cabeçalho), fato_nota_fiscal_item (itens).

import type { PrismaClient } from "@/generated/prisma/client";

export async function queryFaturamentoPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalNotas: number; valorFaturado: number }> {
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { entradaSaida: "1", situacaoNfe: "autorizada", ...periodoWhere },
    select: { vrNf: true },
  });

  const valorFaturado = rows.reduce((acc, r) => acc + Number(r.vrNf), 0);
  return { totalNotas: rows.length, valorFaturado };
}

export async function queryNotasEmitidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; situacaoNfe?: string },
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
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  const situacaoWhere = filtros.situacaoNfe ? { situacaoNfe: filtros.situacaoNfe } : {};

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { entradaSaida: "1", ...situacaoWhere, ...periodoWhere },
    select: { numero: true, serie: true, dataEmissao: true, situacaoNfe: true, participanteNome: true, vrNf: true },
  });

  const linhas = rows.map((r) => ({
    numero: r.numero,
    serie: r.serie,
    dataEmissao: r.dataEmissao,
    situacaoNfe: r.situacaoNfe,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  const valorTotal = linhas.reduce((acc, r) => acc + r.vrNf, 0);
  return { linhas, totalNotas: linhas.length, valorTotal };
}

export async function queryNotasRecebidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
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
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { entradaSaida: "0", ...periodoWhere },
    select: { numero: true, dataEmissao: true, participanteNome: true, vrNf: true },
  });

  const linhas = rows.map((r) => ({
    numero: r.numero,
    dataEmissao: r.dataEmissao,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  const valorTotal = linhas.reduce((acc, r) => acc + r.vrNf, 0);
  return { linhas, totalNotas: linhas.length, valorTotal };
}

export async function queryImpostosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalNotas: number; somaIbpt: number; somaIcmsProprio: number }> {
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { ...periodoWhere },
    select: { vrIbpt: true, vrIcmsProprio: true },
  });

  const somaIbpt = rows.reduce((acc, r) => acc + Number(r.vrIbpt), 0);
  const somaIcmsProprio = rows.reduce((acc, r) => acc + Number(r.vrIcmsProprio), 0);
  return { totalNotas: rows.length, somaIbpt, somaIcmsProprio };
}

export async function queryFaturamentoPorCliente(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{
  linhas: { participanteNome: string | null; quantidade: number; valorTotal: number }[];
}> {
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { entradaSaida: "1", situacaoNfe: "autorizada", ...periodoWhere },
    select: { participanteNome: true, vrNf: true },
  });

  // Agregação em memória por participanteNome
  const map = new Map<string | null, { quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.participanteNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrNf);
    } else {
      map.set(key, { quantidade: 1, valorTotal: Number(r.vrNf) });
    }
  }

  const linhas = [...map.entries()]
    .map(([participanteNome, v]) => ({ participanteNome, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal);

  return { linhas };
}

export async function queryProdutosFaturados(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limite?: number },
): Promise<{
  linhas: { produtoNome: string | null; quantidadeTotal: number; valorTotal: number }[];
}> {
  const limite = filtros.limite ?? 20;

  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  // FatoNotaFiscalItem não tem relação Prisma com FatoNotaFiscal — campos
  // entradaSaida e dataEmissao são desnormalizados diretamente no item (N8).
  const rows = await prisma.fatoNotaFiscalItem.findMany({
    where: {
      entradaSaida: "1",
      ...periodoWhere,
    },
    select: {
      produtoNome: true,
      quantidade: true,
      vrProdutos: true,
    },
  });

  // Agregação em memória por produtoNome
  const map = new Map<string | null, { quantidadeTotal: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.produtoNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidadeTotal += Number(r.quantidade ?? 0);
      existing.valorTotal += Number(r.vrProdutos ?? 0);
    } else {
      map.set(key, {
        quantidadeTotal: Number(r.quantidade ?? 0),
        valorTotal: Number(r.vrProdutos ?? 0),
      });
    }
  }

  const linhas = [...map.entries()]
    .map(([produtoNome, v]) => ({ produtoNome, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limite);

  return { linhas };
}
