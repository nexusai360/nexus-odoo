// src/lib/reports/queries/comercial-cotacao.ts
// B4 , consultas de cotação e comissão. Framework-neutro. Fontes:
// fato_cotacao, fato_comissao. Estruturais (0 reg ate a Matrix operar).
import type { PrismaClient } from "@/generated/prisma/client";
import { idsPedidosNoCorte } from "./comercial";

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
/**
 * LIMITE CONHECIDO (data de início das análises): fato_cotacao NÃO tem coluna de data
 * (nem do documento, nem de validade) , ver prisma/schema.prisma model FatoCotacao.
 * Sem uma data materializada no fato, não existe piso a aplicar aqui. O fato está
 * vazio hoje (a Matrix não opera cotação), então não há vazamento de histórico; quando
 * o módulo entrar em operação, o builder precisa materializar a data da cotação e esta
 * query passa a grampeá-la ao corte (janelaClampada), como as demais.
 */
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
/**
 * Comissões: fato_comissao não tem data própria, mas é um lançamento SEMPRE vinculado a
 * um pedido (documento com data). O piso da janela de análise vem do pedido pai: só
 * entram comissões de pedidos com data_orcamento >= corte. Comissão sem pedido não tem
 * como ser datada e, por isso, fica fora da janela analisada.
 */
export async function queryComissoes(
  prisma: PrismaClient,
  filtros: { participanteId?: number; pedidoId?: number; limite?: number },
): Promise<{ linhas: ComissaoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const pedidosNoCorte = await idsPedidosNoCorte(prisma);
  // Quando o chamador pede um pedido específico, o recorte é a interseção: o pedido só
  // vale se estiver dentro da janela de análise.
  const pedidoIdIn =
    filtros.pedidoId != null
      ? pedidosNoCorte.filter((id) => id === filtros.pedidoId)
      : pedidosNoCorte;
  const where = {
    ...(filtros.participanteId != null ? { participanteId: filtros.participanteId } : {}),
    pedidoId: { in: pedidoIdIn },
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
