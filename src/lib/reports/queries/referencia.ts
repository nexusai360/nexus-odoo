// src/lib/reports/queries/referencia.ts
//
// Consulta da camada de referência (F4 L1b). Framework-neutro: recebe `prisma`
// + filtros, devolve dados crus. `withFreshness` vive no handler MCP.
// Fonte: fato_referencia (NCM, CFOP, CEST, municípios, etc. achatados).
import type { PrismaClient } from "@/generated/prisma/client";

export interface ReferenciaLinha {
  tabela: string;
  codigo: string;
  descricao: string | null;
}

/** Busca entradas de uma tabela de referência nomeada por `termo` (ILIKE em
 * código e descrição). Sem `termo`, lista a tabela inteira. Devolve até
 * `limit` linhas a partir de `offset`, com `total` e `truncado`.
 * Alavanca 2b: paginação via take/skip + desempate estável por id (a tabela
 * fato_referencia usa id autoincrement, não odooId). */
export async function queryReferenciaBuscar(
  prisma: PrismaClient,
  filtros: { tabela: string; termo?: string; limit?: number; offset?: number },
): Promise<{ linhas: ReferenciaLinha[]; total: number; truncado: boolean }> {
  const termo = filtros.termo?.trim();
  const where = {
    tabela: filtros.tabela,
    ...(termo
      ? {
          OR: [
            { codigo: { contains: termo, mode: "insensitive" as const } },
            { descricao: { contains: termo, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fatoReferencia.findMany({
      where,
      orderBy: [{ codigo: "asc" }, { id: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoReferencia.count({ where }),
  ]);
  const offset = filtros.offset ?? 0;
  return {
    linhas: rows.map((r) => ({ tabela: r.tabela, codigo: r.codigo, descricao: r.descricao })),
    total,
    truncado: offset + rows.length < total,
  };
}
