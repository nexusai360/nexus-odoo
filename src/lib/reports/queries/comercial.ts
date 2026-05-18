// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.

import type { PrismaClient } from "@/generated/prisma/client";

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

// Placeholder — substituído em B.8
export async function queryPedidosAtrasados(
  _prisma: PrismaClient,
  _hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number; diasAtraso: number }[]; totalAtrasado: number }> {
  throw new Error("not implemented");
}

// Placeholder — substituído em B.9
export async function queryParcelasAVencer(
  _prisma: PrismaClient,
  _filtros: { ateDias?: number },
  _hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number }[]; totalAVencer: number }> {
  throw new Error("not implemented");
}
