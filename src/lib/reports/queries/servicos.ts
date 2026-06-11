// src/lib/reports/queries/servicos.ts
//
// Núcleo de consulta do catálogo de serviços, framework-neutro. Recebe
// `prisma` + filtros, devolve dados crus. `withFreshness` vive no handler MCP.
// Fonte primária: fato_servico (de sped.servico).

import type { PrismaClient } from "@/generated/prisma/client";

export interface ServicoLinha {
  odooId: number;
  codigo: string;
  codigoFormatado: string | null;
  descricao: string;
  codigoTributacao: string | null;
  alInssRetido: number;
}

const SELECT = {
  odooId: true,
  codigo: true,
  codigoFormatado: true,
  descricao: true,
  codigoTributacao: true,
  alInssRetido: true,
} as const;

type RawRow = Omit<ServicoLinha, "alInssRetido"> & {
  alInssRetido: { toNumber(): number };
};

function toLinha(r: RawRow): ServicoLinha {
  return { ...r, alInssRetido: r.alInssRetido.toNumber() };
}

// ---------------------------------------------------------------------------
// queryServicoBuscar
// ---------------------------------------------------------------------------

/** Busca serviços por `termo` (ILIKE em codigo, codigoFormatado e descricao).
 * Pagina via limit/offset (alavanca 2b): a busca usa um unico `where` ILIKE
 * (nao une ids de varios caminhos), entao o limit/offset roda direto no SQL
 * via take/skip, com o `total` vindo de um `count` do mesmo `where`. */
export async function queryServicoBuscar(
  prisma: PrismaClient,
  filtros: { termo: string; limit: number; offset: number },
): Promise<{
  linhas: ServicoLinha[];
  total: number;
  truncado: boolean;
  ordenadoPor: string;
}> {
  const { limit, offset } = filtros;
  const termo = filtros.termo;
  const where = {
    OR: [
      { codigo: { contains: termo, mode: "insensitive" as const } },
      { codigoFormatado: { contains: termo, mode: "insensitive" as const } },
      { descricao: { contains: termo, mode: "insensitive" as const } },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.fatoServico.findMany({
      where,
      select: SELECT,
      // Ordenacao estavel + desempate por odooId: garante que "os proximos"
      // nao repitam nem pulem item entre paginas (alavanca 2b).
      orderBy: [{ codigo: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoServico.count({ where }),
  ]);
  // Contrato de lista (Fase B): orderBy codigo asc (desempate odooId).
  return {
    linhas: rows.map(toLinha),
    total,
    truncado: offset + rows.length < total,
    ordenadoPor: "código asc",
  };
}

// ---------------------------------------------------------------------------
// queryServicoListar
// ---------------------------------------------------------------------------

/** Lista o catálogo de serviços ordenado por código. Pagina via limit/offset
 * (alavanca 2b): devolve `limit` linhas a partir de `offset`, com `total` e
 * `truncado`. */
export async function queryServicoListar(
  prisma: PrismaClient,
  filtros: { limit: number; offset: number },
): Promise<{
  linhas: ServicoLinha[];
  total: number;
  truncado: boolean;
  ordenadoPor: string;
}> {
  const { limit, offset } = filtros;
  const [rows, total] = await Promise.all([
    prisma.fatoServico.findMany({
      select: SELECT,
      // Ordenacao estavel + desempate por odooId: garante que "os proximos"
      // nao repitam nem pulem item entre paginas (alavanca 2b).
      orderBy: [{ codigo: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoServico.count(),
  ]);
  // Contrato de lista (Fase B): orderBy codigo asc (desempate odooId).
  return {
    linhas: rows.map(toLinha),
    total,
    truncado: offset + rows.length < total,
    ordenadoPor: "código asc",
  };
}

// ---------------------------------------------------------------------------
// queryContarServicos
// ---------------------------------------------------------------------------

/** Conta o total de serviços no catálogo (fato_servico). Devolve só o número,
 * sem amostra de linhas, para perguntas de contagem-total ("quantos serviços"). */
export async function queryContarServicos(
  prisma: PrismaClient,
): Promise<{ total: number }> {
  const total = await prisma.fatoServico.count();
  return { total };
}
