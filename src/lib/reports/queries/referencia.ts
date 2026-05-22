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
 * `limite` (padrão 50) linhas, com `total` e `truncado`. */
export async function queryReferenciaBuscar(
  prisma: PrismaClient,
  filtros: { tabela: string; termo?: string; limite?: number },
): Promise<{ linhas: ReferenciaLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 50;
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
    prisma.fatoReferencia.findMany({ where, orderBy: { codigo: "asc" }, take: limite }),
    prisma.fatoReferencia.count({ where }),
  ]);
  return {
    linhas: rows.map((r) => ({ tabela: r.tabela, codigo: r.codigo, descricao: r.descricao })),
    total,
    truncado: total > rows.length,
  };
}
