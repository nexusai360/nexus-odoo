// src/lib/reports/queries/contabil.ts
//
// Núcleo de agregação contábil, framework-neutro. Recebe `prisma` + filtros,
// devolve dados crus , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_conta_contabil (plano de contas hierárquico).
//
// NOTA: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group
// , apenas a estrutura do plano de contas (tipo S=sintética, A=analítica).

import type { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// queryPlanoDeContas
// ---------------------------------------------------------------------------

/** Lista contas do plano, opcionalmente filtrando por termo (ILIKE em codigo/nome).
 * Devolve até `limite` (padrão 250) resultados ordenados por codigo, junto com
 * `total` (contagem completa do filtro) e `truncado` , para a resposta nunca
 * ocultar silenciosamente que há mais contas do que as retornadas. */
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
  total: number;
  truncado: boolean;
}> {
  const limite = filtros.limite ?? 250;
  // F5 FIX: busca tokenizada (AND de palavras). Antes "impostos a recolher"
  // nao achava "OUTROS IMPOSTOS E TAXAS A RECOLHER" porque contains literal.
  const STOPWORDS = new Set(["a", "as", "de", "do", "da", "dos", "das", "e", "o", "os", "para", "pra", "no", "na", "nos", "nas", "que", "por"]);
  let where: Record<string, unknown> = {};
  if (filtros.termo) {
    const tokens = filtros.termo
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    where = {
      OR: [
        { codigo: { contains: filtros.termo, mode: "insensitive" as const } },
        tokens.length > 0
          ? { AND: tokens.map((tk) => ({ nome: { contains: tk, mode: "insensitive" as const } })) }
          : { nome: { contains: filtros.termo, mode: "insensitive" as const } },
      ],
    };
  }

  const [linhas, total] = await Promise.all([
    prisma.fatoContaContabil.findMany({
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
    }),
    prisma.fatoContaContabil.count({ where }),
  ]);
  return { linhas, total, truncado: total > linhas.length };
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
