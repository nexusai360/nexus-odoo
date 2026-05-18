// src/lib/reports/queries/contabil.ts
//
// Núcleo de agregação contábil, framework-neutro. Recebe `prisma` + filtros,
// devolve dados crus — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_conta_contabil (plano de contas hierárquico).
//
// NOTA: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group
// — apenas a estrutura do plano de contas (tipo S=sintética, A=analítica).

import type { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// queryPlanoDeContas
// ---------------------------------------------------------------------------

/** Lista contas do plano, opcionalmente filtrando por termo (ILIKE em codigo/nome).
 * Devolve até `limite` (padrão 100) resultados ordenados por codigo. */
export async function queryPlanoDeContas(
  prisma: PrismaClient,
  filtros: { termo?: string; limite?: number },
): Promise<{
  linhas: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
    contaPaiNome: string | null;
  }[];
}> {
  const limite = filtros.limite ?? 100;
  const where = filtros.termo
    ? {
        OR: [
          { codigo: { contains: filtros.termo, mode: "insensitive" as const } },
          { nome: { contains: filtros.termo, mode: "insensitive" as const } },
        ],
      }
    : {};

  const linhas = await prisma.fatoContaContabil.findMany({
    where,
    select: {
      odooId: true,
      codigo: true,
      nome: true,
      tipo: true,
      contaPaiNome: true,
    },
    orderBy: { codigo: "asc" },
    take: limite,
  });
  return { linhas };
}

// ---------------------------------------------------------------------------
// queryEstruturaConta
// ---------------------------------------------------------------------------

/** Retorna a conta pelo odooId e suas contas filhas diretas.
 * Casos: (a) conta com filhas; (b) conta-folha sem filhas; (c) conta inexistente. */
export async function queryEstruturaConta(
  prisma: PrismaClient,
  filtros: { odooId: number },
): Promise<{
  conta: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
    contaPaiNome: string | null;
  } | null;
  filhas: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
  }[];
}> {
  const [conta, filhas] = await Promise.all([
    prisma.fatoContaContabil.findUnique({
      where: { odooId: filtros.odooId },
      select: {
        odooId: true,
        codigo: true,
        nome: true,
        tipo: true,
        contaPaiNome: true,
      },
    }),
    prisma.fatoContaContabil.findMany({
      where: { contaPaiId: filtros.odooId },
      select: {
        odooId: true,
        codigo: true,
        nome: true,
        tipo: true,
      },
      orderBy: { codigo: "asc" },
    }),
  ]);
  return { conta: conta ?? null, filhas };
}
