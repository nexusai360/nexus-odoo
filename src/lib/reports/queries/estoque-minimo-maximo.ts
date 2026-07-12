// src/lib/reports/queries/estoque-minimo-maximo.ts
// B6 , parâmetros de mín/máx de estoque. Fonte: fato_estoque_min_max.
//
// A data de inicio das analises (AppSetting sync.corte_dados) NAO se aplica aqui: as regras
// de reposicao (quantidade minima/maxima por produto x local) sao CADASTRO/parametro, nao
// documento com data. Nao ha historico sendo lido e o fato nem tem coluna de data , filtrar
// esconderia parametro que esta valendo hoje.
import type { PrismaClient } from "@/generated/prisma/client";

export interface MinMaxLinha {
  odooId: number;
  produto: string | null;
  local: string | null;
  unidade: string | null;
  quantidadeMinima: number;
  quantidadeMaxima: number;
}

export async function fatoEstoqueMinMaxCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoEstoqueMinMax.count();
}

export async function queryEstoqueMinMax(
  prisma: PrismaClient,
  filtros: { limite?: number },
): Promise<{ linhas: MinMaxLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const [rows, total] = await Promise.all([
    prisma.fatoEstoqueMinMax.findMany({ orderBy: { produtoId: "asc" }, take: limite }),
    prisma.fatoEstoqueMinMax.count(),
  ]);
  const linhas: MinMaxLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    produto: r.produtoNome,
    local: r.localNome,
    unidade: r.unidadeNome,
    quantidadeMinima: r.quantidadeMinima.toNumber(),
    quantidadeMaxima: r.quantidadeMaxima.toNumber(),
  }));
  return { linhas, total, truncado: total > rows.length };
}
