// src/lib/reports/queries/fiscal.ts
//
// Núcleo de agregação de fiscal, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_nota_fiscal (cabeçalho), fato_nota_fiscal_item (itens).

import type { PrismaClient } from "@/generated/prisma/client";
import { buildPeriodoWhere } from "@/lib/metrics/_shared/periodo";
import { buildEmpresaWhere } from "@/lib/metrics/_shared/empresa";
import { idsNaoVenda, buildNaturezaVendaWhere } from "@/lib/metrics/_shared/naturezas";

export async function queryFaturamentoPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number },
): Promise<{ totalNotas: number; valorFaturado: number }> {
  // F1: passa a usar a definicao canonica de faturamento de venda (borda de periodo
  // exclusiva, exclui operacoes nao-venda como devolucao/transferencia, corte por empresa).
  // A chave publica valorFaturado e mantida. O numero muda onde houver nao-venda (correto).
  const naoVenda = await idsNaoVenda(prisma);
  const rows = await prisma.fatoNotaFiscal.findMany({
    where: {
      entradaSaida: "1",
      situacaoNfe: "autorizada",
      ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
      ...buildEmpresaWhere(filtros.empresaId),
      ...buildNaturezaVendaWhere(naoVenda),
    },
    select: { vrNf: true },
  });

  const valorFaturado = rows.reduce((acc, r) => acc + Number(r.vrNf), 0);
  return { totalNotas: rows.length, valorFaturado };
}

export async function queryNotasEmitidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; situacaoNfe?: string; empresaId?: number; limit?: number; offset?: number },
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
  // Contrato de lista (Fase B): top 10 notas por valor (vrNf desc) sobre TODO o
  // recorte. A lista paginada vem por data, entao "N maiores notas" exige esta
  // visao calculada no SQL inteiro (independente da pagina).
  topMaiores: { nome: string; valor: number; numero: string; dataEmissao: string | null }[];
}> {
  // F1: borda de periodo exclusiva + corte por empresa. NAO aplica filtro de
  // natureza de venda: esta funcao LISTA notas emitidas (qualquer operacao), nao
  // e a metrica de faturamento de venda.
  const situacaoWhere = filtros.situacaoNfe ? { situacaoNfe: filtros.situacaoNfe } : {};
  const where = {
    entradaSaida: "1",
    ...situacaoWhere,
    ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
    ...buildEmpresaWhere(filtros.empresaId),
  };

  // Alavanca 2b: paginação via take/skip; `totalNotas` é o count real e
  // `valorTotal` soma TODO o recorte (aggregate), estável entre páginas.
  // topRows: top 10 por valor sobre o recorte inteiro (independente da pagina).
  const [rows, totalNotas, agg, topRows] = await Promise.all([
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
    prisma.fatoNotaFiscal.findMany({
      where,
      select: { numero: true, dataEmissao: true, participanteNome: true, vrNf: true },
      orderBy: [{ vrNf: "desc" }, { odooId: "asc" }],
      take: 10,
    }),
  ]);

  const linhas = rows.map((r) => ({
    numero: r.numero,
    serie: r.serie,
    dataEmissao: r.dataEmissao,
    situacaoNfe: r.situacaoNfe,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  const topMaiores = topRows.map((r) => ({
    nome: r.participanteNome ?? "",
    valor: Number(r.vrNf),
    numero: r.numero ?? "",
    dataEmissao: r.dataEmissao ? r.dataEmissao.toISOString() : null,
  }));

  return { linhas, totalNotas, valorTotal: Number(agg._sum.vrNf ?? 0), topMaiores };
}

export async function queryNotasRecebidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit?: number; offset?: number },
): Promise<{
  linhas: {
    numero: string | null;
    dataEmissao: Date | null;
    participanteNome: string | null;
    vrNf: number;
  }[];
  totalNotas: number;
  valorTotal: number;
  // Contrato de lista (Fase B): top 10 notas por valor (vrNf desc) sobre TODO o
  // recorte. A lista paginada vem por data, entao "N maiores notas recebidas"
  // exige esta visao calculada no SQL inteiro (independente da pagina).
  topMaiores: { nome: string; valor: number; numero: string; dataEmissao: string | null }[];
}> {
  // F1: borda de periodo exclusiva + corte por empresa (lista de notas de entrada).
  const where = {
    entradaSaida: "0",
    ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
    ...buildEmpresaWhere(filtros.empresaId),
  };

  // Alavanca 2b: paginação via take/skip; `totalNotas` é o count real e
  // `valorTotal` soma TODO o recorte (aggregate), estável entre páginas.
  // topRows: top 10 por valor sobre o recorte inteiro (independente da pagina).
  const [rows, totalNotas, agg, topRows] = await Promise.all([
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
    prisma.fatoNotaFiscal.findMany({
      where,
      select: { numero: true, dataEmissao: true, participanteNome: true, vrNf: true },
      orderBy: [{ vrNf: "desc" }, { odooId: "asc" }],
      take: 10,
    }),
  ]);

  const linhas = rows.map((r) => ({
    numero: r.numero,
    dataEmissao: r.dataEmissao,
    participanteNome: r.participanteNome,
    vrNf: Number(r.vrNf),
  }));

  const topMaiores = topRows.map((r) => ({
    nome: r.participanteNome ?? "",
    valor: Number(r.vrNf),
    numero: r.numero ?? "",
    dataEmissao: r.dataEmissao ? r.dataEmissao.toISOString() : null,
  }));

  return { linhas, totalNotas, valorTotal: Number(agg._sum.vrNf ?? 0), topMaiores };
}

export async function queryImpostosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number },
): Promise<{ totalNotas: number; somaIbpt: number; somaIcmsProprio: number }> {
  // F1: borda de periodo exclusiva + corte por empresa.
  const rows = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
      ...buildEmpresaWhere(filtros.empresaId),
    },
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
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit?: number; offset?: number },
): Promise<{
  linhas: { participanteNome: string | null; quantidade: number; valorTotal: number }[];
  total: number;
  valorGeral: number;
}> {
  // F1: faturamento por cliente = venda autorizada (borda exclusiva, exclui
  // operacoes nao-venda, corte por empresa).
  const naoVenda = await idsNaoVenda(prisma);
  const rows = await prisma.fatoNotaFiscal.findMany({
    where: {
      entradaSaida: "1",
      situacaoNfe: "autorizada",
      ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
      ...buildEmpresaWhere(filtros.empresaId),
      ...buildNaturezaVendaWhere(naoVenda),
    },
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
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit?: number; offset?: number },
): Promise<{
  linhas: { produtoNome: string | null; quantidadeTotal: number; valorTotal: number }[];
  total: number;
  valorGeral: number;
  quantidadeGeral: number;
}> {
  // FatoNotaFiscalItem não tem relação Prisma com FatoNotaFiscal , campos
  // entradaSaida, dataEmissao e empresaId são desnormalizados direto no item (N8 + F1).
  // F1: corte por empresa agora e DIRETO no item (coluna empresa_id), nao via documentoId IN.
  // Mantem vrProdutos (ranking de produto, sem impostos): excecao consciente (SPEC 9.7).
  const rows = await prisma.fatoNotaFiscalItem.findMany({
    where: {
      entradaSaida: "1",
      ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
      ...buildEmpresaWhere(filtros.empresaId),
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
            gte: new Date(`${filtros.periodoDe}T00:00:00Z`),
            lte: new Date(`${filtros.periodoAte}T00:00:00Z`),
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

/**
 * NOTAS SEM CFOP, nota a nota (gap fechado 2026-06-19). Lista as notas de saida
 * AUTORIZADAS que tem item(ns) SEM CFOP (cfop_id null = sem classificacao fiscal),
 * com o valor de produtos desses itens agregado por nota. Responde "liste as notas
 * sem CFOP" , antes o agente so tinha o total agregado (R$/itens), nao a lista.
 * Base: item.vrProdutos (mesma base de faturamentoPorCfop). Ordena por valor desc.
 */
export async function queryNotasSemCfop(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit?: number; offset?: number },
): Promise<{
  linhas: {
    numero: string | null;
    serie: string | null;
    dataEmissao: Date | null;
    participanteNome: string | null;
    finalidadeNfe: string | null;
    totalItens: number;
    valorProdutos: number;
  }[];
  totalNotas: number;
  totalItens: number;
  valorProdutos: number;
}> {
  const whereItem = {
    entradaSaida: "1" as const,
    situacaoNfe: "autorizada" as const,
    cfopId: null,
    ...buildPeriodoWhere(filtros.periodoDe, filtros.periodoAte),
    ...buildEmpresaWhere(filtros.empresaId),
  };

  // (a) agrega itens sem CFOP por nota (documentoId): valor + contagem.
  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["documentoId"],
    where: whereItem,
    _sum: { vrProdutos: true },
    _count: true,
  });

  const totalNotas = grupos.length;
  const totalItens = grupos.reduce((s, g) => s + Number(g._count ?? 0), 0);
  const valorProdutos = grupos.reduce((s, g) => s + Number(g._sum.vrProdutos ?? 0), 0);

  // (b) ordena por valor desc e pagina sobre o full-set.
  const ordenados = grupos
    .map((g) => ({
      documentoId: g.documentoId,
      totalItens: Number(g._count ?? 0),
      valorProdutos: Number(g._sum.vrProdutos ?? 0),
    }))
    .sort((a, b) => b.valorProdutos - a.valorProdutos);
  const off = filtros.offset ?? 0;
  const pagina = filtros.limit !== undefined ? ordenados.slice(off, off + filtros.limit) : ordenados;

  // (c) dados de cabecalho das notas da pagina (numero, participante, finalidade).
  const docIds = pagina.map((p) => p.documentoId).filter((x): x is number => x !== null);
  const notas = docIds.length
    ? await prisma.fatoNotaFiscal.findMany({
        where: { odooId: { in: docIds } },
        select: {
          odooId: true,
          numero: true,
          serie: true,
          dataEmissao: true,
          participanteNome: true,
          finalidadeNfe: true,
        },
      })
    : [];
  const notaPorId = new Map(notas.map((n) => [n.odooId, n]));

  const linhas = pagina.map((p) => {
    const n = p.documentoId !== null ? notaPorId.get(p.documentoId) : undefined;
    return {
      numero: n?.numero ?? null,
      serie: n?.serie ?? null,
      dataEmissao: n?.dataEmissao ?? null,
      participanteNome: n?.participanteNome ?? null,
      finalidadeNfe: n?.finalidadeNfe ?? null,
      totalItens: p.totalItens,
      valorProdutos: p.valorProdutos,
    };
  });

  return { linhas, totalNotas, totalItens, valorProdutos };
}
