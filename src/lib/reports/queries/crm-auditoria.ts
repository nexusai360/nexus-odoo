// src/lib/reports/queries/crm-auditoria.ts , B7.
// Fontes: fato_crm_pipeline (0 reg), fato_auditoria_regra (15 reg).
//
// A data de início das análises NÃO se aplica a nenhuma das duas: funil de CRM (nome, tipo,
// ativo) e regra de auditoria (nome, ativa, prazo em dias) são CONFIGURAÇÃO/cadastro, não
// documento com data. Nenhum dos dois fatos tem data de negócio, só `atualizado_em` (metadado
// da sincronização). O piso valeria para a OPORTUNIDADE que anda no funil, não para o funil.
import type { PrismaClient } from "@/generated/prisma/client";

export interface PipelineLinha {
  odooId: number;
  numero: number | null;
  nome: string | null;
  tipo: string | null;
  ativo: boolean;
}
export async function fatoCrmPipelineCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoCrmPipeline.count();
}
export async function queryCrmPipelines(
  prisma: PrismaClient,
  filtros: { limite?: number },
): Promise<{ linhas: PipelineLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const [rows, total] = await Promise.all([
    prisma.fatoCrmPipeline.findMany({ orderBy: { numero: "asc" }, take: limite }),
    prisma.fatoCrmPipeline.count(),
  ]);
  const linhas: PipelineLinha[] = rows.map((r) => ({
    odooId: r.odooId, numero: r.numero, nome: r.nome, tipo: r.tipo, ativo: r.ativo,
  }));
  return { linhas, total, truncado: total > rows.length };
}

export interface RegraLinha {
  odooId: number;
  nome: string | null;
  ativa: boolean;
  dias: number;
}
export async function fatoAuditoriaRegraCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoAuditoriaRegra.count();
}
export async function queryAuditoriaRegras(
  prisma: PrismaClient,
  filtros: { apenasAtivas?: boolean; limite?: number },
): Promise<{ linhas: RegraLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const where = filtros.apenasAtivas ? { ativa: true } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoAuditoriaRegra.findMany({ where, orderBy: { nome: "asc" }, take: limite }),
    prisma.fatoAuditoriaRegra.count({ where }),
  ]);
  const linhas: RegraLinha[] = rows.map((r) => ({
    odooId: r.odooId, nome: r.nome, ativa: r.ativa, dias: r.dias.toNumber(),
  }));
  return { linhas, total, truncado: total > rows.length };
}
