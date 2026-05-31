// src/lib/reports/queries/comercial-cotacao.ts
// B4 , consultas de cotação e comissão. Framework-neutro. Fontes:
// fato_cotacao, fato_comissao. Estruturais (0 reg ate a Matrix operar).
import type { PrismaClient } from "@/generated/prisma/client";

export interface CotacaoLinha {
  odooId: number;
  numero: string | null;
  status: string | null;
  ehCompra: boolean;
  operacao: string | null;
}
export async function fatoCotacaoCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoCotacao.count();
}
export async function queryCotacoes(
  prisma: PrismaClient,
  filtros: { status?: string; ehCompra?: boolean; limite?: number },
): Promise<{ linhas: CotacaoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const where = {
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.ehCompra != null ? { ehCompra: filtros.ehCompra } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fatoCotacao.findMany({ where, orderBy: { odooId: "desc" }, take: limite }),
    prisma.fatoCotacao.count({ where }),
  ]);
  const linhas: CotacaoLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    numero: r.numero,
    status: r.status,
    ehCompra: r.ehCompra,
    operacao: r.operacaoNome,
  }));
  return { linhas, total, truncado: total > rows.length };
}

export interface ComissaoLinha {
  odooId: number;
  pedidoId: number | null;
  participante: string | null;
  bcComissao: number;
  alComissao: number;
  vrComissao: number;
}
export async function fatoComissaoCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoComissao.count();
}
export async function queryComissoes(
  prisma: PrismaClient,
  filtros: { participanteId?: number; pedidoId?: number; limite?: number },
): Promise<{ linhas: ComissaoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const where = {
    ...(filtros.participanteId != null ? { participanteId: filtros.participanteId } : {}),
    ...(filtros.pedidoId != null ? { pedidoId: filtros.pedidoId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fatoComissao.findMany({ where, orderBy: { odooId: "desc" }, take: limite }),
    prisma.fatoComissao.count({ where }),
  ]);
  const linhas: ComissaoLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    pedidoId: r.pedidoId,
    participante: r.participanteNome,
    bcComissao: r.bcComissao.toNumber(),
    alComissao: r.alComissao.toNumber(),
    vrComissao: r.vrComissao.toNumber(),
  }));
  return { linhas, total, truncado: total > rows.length };
}
