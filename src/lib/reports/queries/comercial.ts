// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.

import type { PrismaClient } from "@/generated/prisma/client";
import { diasAtraso } from "../../../../mcp/lib/dias-atraso";

// Funções implementadas nas tasks B.5–B.9 (sequenciais — mesmo arquivo).
export type { PrismaClient as _PC }; // evita "no exports" no TS até as funções serem adicionadas

export async function queryPedidosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalPedidos: number; valorTotal: number }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataOrcamento: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};
  const rows = await prisma.fatoPedido.findMany({ where, select: { vrNf: true } });
  const valorTotal = rows.reduce((acc, r) => acc + Number(r.vrNf), 0);
  return { totalPedidos: rows.length, valorTotal };
}

export async function queryPedidosPorEtapa(
  prisma: PrismaClient,
): Promise<{ linhas: { etapaNome: string | null; etapaFinaliza: boolean; quantidade: number; valorTotal: number }[] }> {
  const rows = await prisma.fatoPedido.findMany({
    select: { etapaNome: true, etapaFinaliza: true, vrNf: true },
  });
  // Agrupa em memória por etapaNome (não groupBy — precisa carregar etapaFinaliza)
  const map = new Map<string | null, { etapaFinaliza: boolean; quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.etapaNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrNf);
    } else {
      map.set(key, { etapaFinaliza: r.etapaFinaliza, quantidade: 1, valorTotal: Number(r.vrNf) });
    }
  }
  const linhas = [...map.entries()].map(([etapaNome, v]) => ({ etapaNome, ...v }));
  return { linhas };
}

export async function queryPedidosPorVendedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ linhas: { vendedorNome: string | null; quantidade: number; valorTotal: number }[] }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataOrcamento: {
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};
  const rows = await prisma.fatoPedido.findMany({
    where,
    select: { vendedorNome: true, vrNf: true },
  });
  const map = new Map<string | null, { quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.vendedorNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrNf);
    } else {
      map.set(key, { quantidade: 1, valorTotal: Number(r.vrNf) });
    }
  }
  const linhas = [...map.entries()]
    .map(([vendedorNome, v]) => ({ vendedorNome, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal);
  return { linhas };
}

export async function queryPedidosAtrasados(
  prisma: PrismaClient,
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number; diasAtraso: number }[]; totalAtrasado: number }> {
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: {
      dataVencimento: { lt: hoje },
      parcelaFaturada: false,
    },
    select: {
      pedidoId: true,
      participanteNome: true,
      numero: true,
      dataVencimento: true,
      valor: true,
    },
  });
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
    diasAtraso: diasAtraso(r.dataVencimento, hoje),
  }));
  const totalAtrasado = linhas.reduce((acc, l) => acc + l.valor, 0);
  return { linhas, totalAtrasado };
}

export async function queryParcelasAVencer(
  prisma: PrismaClient,
  filtros: { ateDias?: number },
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number }[]; totalAVencer: number }> {
  const ateDias = filtros.ateDias ?? 30;
  const limite = new Date(hoje.getTime() + ateDias * 24 * 60 * 60 * 1000);
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: {
      dataVencimento: { gte: hoje, lte: limite },
      parcelaFaturada: false,
    },
    select: {
      pedidoId: true,
      participanteNome: true,
      numero: true,
      dataVencimento: true,
      valor: true,
    },
    orderBy: { dataVencimento: "asc" },
  });
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
  }));
  const totalAVencer = linhas.reduce((acc, l) => acc + l.valor, 0);
  return { linhas, totalAVencer };
}
