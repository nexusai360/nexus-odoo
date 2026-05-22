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
 * Devolve até `limite` (padrão 50) linhas, com `total` e `truncado`. */
export async function queryServicoBuscar(
  prisma: PrismaClient,
  filtros: { termo: string; limite?: number },
): Promise<{ linhas: ServicoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 50;
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
      orderBy: { codigo: "asc" },
      take: limite,
    }),
    prisma.fatoServico.count({ where }),
  ]);
  return { linhas: rows.map(toLinha), total, truncado: total > rows.length };
}

// ---------------------------------------------------------------------------
// queryServicoListar
// ---------------------------------------------------------------------------

/** Lista o catálogo de serviços ordenado por código. Devolve até `limite`
 * (padrão 250) linhas, com `total` e `truncado`. */
export async function queryServicoListar(
  prisma: PrismaClient,
  filtros: { limite?: number },
): Promise<{ linhas: ServicoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 250;
  const [rows, total] = await Promise.all([
    prisma.fatoServico.findMany({
      select: SELECT,
      orderBy: { codigo: "asc" },
      take: limite,
    }),
    prisma.fatoServico.count(),
  ]);
  return { linhas: rows.map(toLinha), total, truncado: total > rows.length };
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
