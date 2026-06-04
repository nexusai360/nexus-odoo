// src/lib/reports/queries/fiscal.ts
//
// Núcleo de agregação de fiscal, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua , sem `estado`/`freshness`/shaping. Não captura exceção.
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
  filtros: { periodoDe?: string; periodoAte?: string; situacaoNfe?: string; limit?: number; offset?: number },
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
  const where = { entradaSaida: "1", ...situacaoWhere, ...periodoWhere };

  // Alavanca 2b: paginação via take/skip; `totalNotas` é o count real e
  // `valorTotal` soma TODO o recorte (aggregate), estável entre páginas.
  const [rows, totalNotas, agg] = await Promise.all([
    prisma.fatoNotaFiscal.findMany({
      where,
      select: { numero: true, serie: true, dataEmissao: true, situacaoNfe: true, participanteNome: true, vrNf: true },
      // Ordenação estável + desempate por odooId (alavanca 2b).
      orderBy: [{ dataEmissao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoNotaFiscal.count({ where }),
    prisma.fatoNotaFiscal.aggregate({ where, _sum: { vrNf: true } }),
  ]);

  const linhas = rows.map((r) => ({
    numero: r.numero,
    serie: r.serie,
    dataEmissao: r.dataEmissao,
    situacaoNfe: r.situacaoNfe,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  return { linhas, totalNotas, valorTotal: Number(agg._sum.vrNf ?? 0) };
}

export async function queryNotasRecebidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit?: number; offset?: number },
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
  const where = { entradaSaida: "0", ...periodoWhere };

  // Alavanca 2b: paginação via take/skip; `totalNotas` é o count real e
  // `valorTotal` soma TODO o recorte (aggregate), estável entre páginas.
  const [rows, totalNotas, agg] = await Promise.all([
    prisma.fatoNotaFiscal.findMany({
      where,
      select: { numero: true, dataEmissao: true, participanteNome: true, vrNf: true },
      // Ordenação estável + desempate por odooId (alavanca 2b).
      orderBy: [{ dataEmissao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoNotaFiscal.count({ where }),
    prisma.fatoNotaFiscal.aggregate({ where, _sum: { vrNf: true } }),
  ]);

  const linhas = rows.map((r) => ({
    numero: r.numero,
    dataEmissao: r.dataEmissao,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  return { linhas, totalNotas, valorTotal: Number(agg._sum.vrNf ?? 0) };
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

/** Faturamento agregado por cliente.
 * Alavanca 2b , EXCEÇÃO de paginação em memória: a agregação por cliente é
 * feita em memória, então não há take/skip no SQL. Ordenamos o conjunto de
 * forma estável (valor desc, depois o nome como desempate) e fatiamos
 * [offset, offset+limit). `total` é o número de clientes distintos (todos os
 * grupos), independente da página. */
export async function queryFaturamentoPorCliente(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit?: number; offset?: number },
): Promise<{
  linhas: { participanteNome: string | null; quantidade: number; valorTotal: number }[];
  total: number;
  valorGeral: number;
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
  let valorGeral = 0;
  for (const r of rows) {
    const key = r.participanteNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrNf);
    } else {
      map.set(key, { quantidade: 1, valorTotal: Number(r.vrNf) });
    }
    valorGeral += Number(r.vrNf);
  }

  const ordenados = [...map.entries()]
    .map(([participanteNome, v]) => ({ participanteNome, ...v }))
    // Desempate estável pelo nome do participante (após valor desc).
    .sort((a, b) => b.valorTotal - a.valorTotal || (a.participanteNome ?? "").localeCompare(b.participanteNome ?? ""));

  const offset = filtros.offset ?? 0;
  const limit = filtros.limit ?? 30;
  return { linhas: ordenados.slice(offset, offset + limit), total: map.size, valorGeral };
}

/** Produtos mais faturados.
 * Alavanca 2b , EXCEÇÃO de paginação em memória: agrega itens por produtoNome
 * em memória; ordena estável (valor desc, depois nome) e fatia
 * [offset, offset+limit). `total` = produtos distintos; `valorGeral` é a soma
 * de todo o recorte. */
export async function queryProdutosFaturados(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit?: number; offset?: number },
): Promise<{
  linhas: { produtoNome: string | null; quantidadeTotal: number; valorTotal: number }[];
  total: number;
  valorGeral: number;
  quantidadeGeral: number;
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

  // FatoNotaFiscalItem não tem relação Prisma com FatoNotaFiscal , campos
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
  let valorGeral = 0;
  let quantidadeGeral = 0;
  for (const r of rows) {
    const key = r.produtoNome;
    const q = Number(r.quantidade ?? 0);
    const v = Number(r.vrProdutos ?? 0);
    const existing = map.get(key);
    if (existing) {
      existing.quantidadeTotal += q;
      existing.valorTotal += v;
    } else {
      map.set(key, { quantidadeTotal: q, valorTotal: v });
    }
    valorGeral += v;
    quantidadeGeral += q;
  }

  const ordenados = [...map.entries()]
    .map(([produtoNome, v]) => ({ produtoNome, ...v }))
    // Desempate estável pelo nome do produto (após valor desc).
    .sort((a, b) => b.valorTotal - a.valorTotal || (a.produtoNome ?? "").localeCompare(b.produtoNome ?? ""));

  const offset = filtros.offset ?? 0;
  const limit = filtros.limit ?? 30;
  return {
    linhas: ordenados.slice(offset, offset + limit),
    total: map.size,
    valorGeral,
    quantidadeGeral,
  };
}

// ---------------------------------------------------------------------------
// queryNotasRecebidasPorFornecedor , F4 L1a Onda 3
// ---------------------------------------------------------------------------

/** Notas fiscais de entrada (DF-e de fornecedores) agregadas por fornecedor.
 * Espelha queryFaturamentoPorCliente, mas no sentido de entrada
 * (entradaSaida = "0"). Ordena por valor recebido e corta em `limite`.
 *
 * Filtros de fornecedor:
 *  - `fornecedor`: busca parcial (ILIKE) no nome do participante. Um nome
 *    pode casar com mais de um participante (matriz/filial, nomes parecidos),
 *    gerando várias linhas.
 *  - `documento`: CNPJ/CPF do fornecedor, comparado dígito a dígito contra o
 *    cadastro de parceiros , identificação inequívoca.
 *
 * `totalAgregado` soma TODAS as notas que casaram o filtro (antes do corte por
 * `limite`), para perguntas de contagem ("quantas notas do fornecedor X").
 * `totalFornecedoresDistintos` é quantos participantes casaram o filtro. */
export async function queryNotasRecebidasPorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; fornecedor?: string; documento?: string; limit?: number; offset?: number },
): Promise<{
  linhas: { participanteNome: string | null; quantidade: number; valorTotal: number }[];
  totalAgregado: { quantidade: number; valorTotal: number };
  totalFornecedoresDistintos: number;
}> {
  // Alavanca 2b , EXCEÇÃO de paginação em memória: agregação por fornecedor é
  // feita em memória; ordena estável (valor desc, depois nome) e fatia
  // [offset, offset+limit). `totalFornecedoresDistintos` = todos os grupos.
  const fornecedorWhere = filtros.fornecedor
    ? { participanteNome: { contains: filtros.fornecedor, mode: "insensitive" as const } }
    : {};
  const periodoWhere =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};

  // Filtro por documento (CNPJ/CPF): fato_nota_fiscal não guarda o documento
  // do participante , resolve via fato_parceiro, comparando só os dígitos para
  // ser imune a formatação (pontos, barras, traços).
  let documentoWhere: { participanteId?: { in: number[] } } = {};
  const alvoDoc = (filtros.documento ?? "").replace(/\D/g, "");
  if (alvoDoc) {
    const parceiros = await prisma.fatoParceiro.findMany({
      select: { odooId: true, documento: true },
    });
    const ids = parceiros
      .filter((p) => (p.documento ?? "").replace(/\D/g, "").includes(alvoDoc))
      .map((p) => p.odooId);
    // Lista vazia → -1 garante zero resultados (em vez de ignorar o filtro).
    documentoWhere = { participanteId: { in: ids.length ? ids : [-1] } };
  }

  const rows = await prisma.fatoNotaFiscal.findMany({
    where: { entradaSaida: "0", ...periodoWhere, ...fornecedorWhere, ...documentoWhere },
    select: { participanteNome: true, vrNf: true },
  });

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

  const ordenados = [...map.entries()]
    .map(([participanteNome, v]) => ({ participanteNome, ...v }))
    // Desempate estável pelo nome do participante (após valor desc).
    .sort((a, b) => b.valorTotal - a.valorTotal || (a.participanteNome ?? "").localeCompare(b.participanteNome ?? ""));
  const offset = filtros.offset ?? 0;
  const limit = filtros.limit ?? 30;
  const linhas = ordenados.slice(offset, offset + limit);

  // Agregado sobre TODAS as linhas que casaram (não só as exibidas).
  const totalAgregado = rows.reduce(
    (acc, r) => ({ quantidade: acc.quantidade + 1, valorTotal: acc.valorTotal + Number(r.vrNf) }),
    { quantidade: 0, valorTotal: 0 },
  );

  return { linhas, totalAgregado, totalFornecedoresDistintos: map.size };
}

// ---------------------------------------------------------------------------
// queryContarNotas
// ---------------------------------------------------------------------------

/** Conta o total de notas fiscais (fato_nota_fiscal), segmentado por entrada
 * (entradaSaida = "0", DF-e de fornecedores) e saída (entradaSaida = "1",
 * notas emitidas). Devolve só os números, para perguntas de contagem-total
 * ("quantas notas fiscais"). */
export async function queryContarNotas(
  prisma: PrismaClient,
): Promise<{ total: number; totalEntrada: number; totalSaida: number }> {
  const [total, totalEntrada, totalSaida] = await Promise.all([
    prisma.fatoNotaFiscal.count(),
    prisma.fatoNotaFiscal.count({ where: { entradaSaida: "0" } }),
    prisma.fatoNotaFiscal.count({ where: { entradaSaida: "1" } }),
  ]);
  return { total, totalEntrada, totalSaida };
}
