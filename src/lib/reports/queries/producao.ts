// src/lib/reports/queries/producao.ts
// B5 , consulta de processos de produção. Fonte: fato_producao_processo.
import type { PrismaClient } from "@/generated/prisma/client";

export interface ProcessoLinha {
  odooId: number;
  ordem: number | null;
  nome: string | null;
  descricao: string | null;
  tempo: number;
}

export async function fatoProducaoProcessoCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoProducaoProcesso.count();
}

export async function queryProducaoProcessos(
  prisma: PrismaClient,
  filtros: { limite?: number },
): Promise<{ linhas: ProcessoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const [rows, total] = await Promise.all([
    prisma.fatoProducaoProcesso.findMany({ orderBy: { ordem: "asc" }, take: limite }),
    prisma.fatoProducaoProcesso.count(),
  ]);
  const linhas: ProcessoLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    ordem: r.ordem,
    nome: r.nome,
    descricao: r.descricao,
    tempo: r.tempo.toNumber(),
  }));
  return { linhas, total, truncado: total > rows.length };
}
