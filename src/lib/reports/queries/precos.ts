// src/lib/reports/queries/precos.ts
//
// Núcleo de consulta de preços, framework-neutro. Recebe `prisma` + filtros,
// devolve dados crus , sem `estado`/`freshness`/shaping. `withFreshness` vive
// no handler MCP, não aqui.
// Fonte primária: fato_preco (regras de preço achatadas de
// sped.tabela.preco.regra).

import type { PrismaClient } from "@/generated/prisma/client";

export interface PrecoLinha {
  odooId: number;
  tabelaNome: string | null;
  dimensao: string;
  produtoNome: string | null;
  familiaNome: string | null;
  participanteNome: string | null;
  operacao: string | null;
  precoBase: string | null;
  valor: number | null;
  aliquota: number | null;
  quantidadeMinima: number;
  dataInicial: string | null;
  dataFinal: string | null;
}

const SELECT = {
  odooId: true,
  tabelaNome: true,
  dimensao: true,
  produtoNome: true,
  familiaNome: true,
  participanteNome: true,
  operacao: true,
  precoBase: true,
  valor: true,
  aliquota: true,
  quantidadeMinima: true,
  dataInicial: true,
  dataFinal: true,
} as const;

type RawRow = {
  odooId: number;
  tabelaNome: string | null;
  dimensao: string;
  produtoNome: string | null;
  familiaNome: string | null;
  participanteNome: string | null;
  operacao: string | null;
  precoBase: string | null;
  valor: { toNumber(): number } | null;
  aliquota: { toNumber(): number } | null;
  quantidadeMinima: { toNumber(): number };
  dataInicial: Date | null;
  dataFinal: Date | null;
};

function toLinha(r: RawRow): PrecoLinha {
  return {
    odooId: r.odooId,
    tabelaNome: r.tabelaNome,
    dimensao: r.dimensao,
    produtoNome: r.produtoNome,
    familiaNome: r.familiaNome,
    participanteNome: r.participanteNome,
    operacao: r.operacao,
    precoBase: r.precoBase,
    valor: r.valor ? r.valor.toNumber() : null,
    aliquota: r.aliquota ? r.aliquota.toNumber() : null,
    quantidadeMinima: r.quantidadeMinima.toNumber(),
    dataInicial: r.dataInicial ? r.dataInicial.toISOString().slice(0, 10) : null,
    dataFinal: r.dataFinal ? r.dataFinal.toISOString().slice(0, 10) : null,
  };
}

// ---------------------------------------------------------------------------
// queryPrecoProduto
// ---------------------------------------------------------------------------

/** Regras de preço de um produto. Filtra por `produtoId` exato ou por `termo`
 * (ILIKE no nome do produto). Sem filtro, lista as regras de dimensão produto.
 * Devolve até `limite` (padrão 100) linhas, com `total` e `truncado`. */
export async function queryPrecoProduto(
  prisma: PrismaClient,
  filtros: { produtoId?: number; termo?: string; limit?: number; offset?: number },
): Promise<{ linhas: PrecoLinha[]; total: number; truncado: boolean }> {
  const where =
    filtros.produtoId != null
      ? { produtoId: filtros.produtoId }
      : filtros.termo
        ? { produtoNome: { contains: filtros.termo, mode: "insensitive" as const } }
        : { dimensao: "produto" };

  // Alavanca 2b: paginacao via take/skip + orderBy estavel com desempate por
  // odooId (senao "os proximos" repetem regras com mesmo produtoNome/tabelaNome).
  const offset = filtros.offset ?? 0;
  const [rows, total] = await Promise.all([
    prisma.fatoPreco.findMany({
      where,
      select: SELECT,
      orderBy: [{ produtoNome: "asc" }, { tabelaNome: "asc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: offset,
    }),
    prisma.fatoPreco.count({ where }),
  ]);
  return { linhas: rows.map(toLinha), total, truncado: offset + rows.length < total };
}

// ---------------------------------------------------------------------------
// queryPrecoTabela
// ---------------------------------------------------------------------------

/** Regras de uma tabela de preço pelo `tabelaId`. Devolve o nome da tabela e
 * até `limite` (padrão 250) regras, com `total` e `truncado`. */
export async function queryPrecoTabela(
  prisma: PrismaClient,
  filtros: { tabelaId: number; limit?: number; offset?: number },
): Promise<{
  tabelaNome: string | null;
  linhas: PrecoLinha[];
  total: number;
  truncado: boolean;
}> {
  const where = { tabelaId: filtros.tabelaId };
  // Alavanca 2b: paginacao via take/skip + orderBy estavel com desempate por
  // odooId (produtoNome/familiaNome se repetem dentro de uma tabela).
  const offset = filtros.offset ?? 0;
  const [rows, total, primeira] = await Promise.all([
    prisma.fatoPreco.findMany({
      where,
      select: SELECT,
      orderBy: [{ produtoNome: "asc" }, { familiaNome: "asc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: offset,
    }),
    prisma.fatoPreco.count({ where }),
    // Nome da tabela independe da pagina: busca a 1a linha do recorte.
    prisma.fatoPreco.findFirst({ where, select: { tabelaNome: true } }),
  ]);
  return {
    tabelaNome: rows[0]?.tabelaNome ?? primeira?.tabelaNome ?? null,
    linhas: rows.map(toLinha),
    total,
    truncado: offset + rows.length < total,
  };
}

// ---------------------------------------------------------------------------
// queryContarRegrasPreco
// ---------------------------------------------------------------------------

/** Conta o total de regras de preço cadastradas (fato_preco). Devolve só o
 * número, sem amostra de linhas, para perguntas de contagem-total
 * ("quantas regras de preço"). */
export async function queryContarRegrasPreco(
  prisma: PrismaClient,
): Promise<{ total: number }> {
  const total = await prisma.fatoPreco.count();
  return { total };
}
