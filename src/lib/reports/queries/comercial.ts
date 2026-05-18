// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.

import type { PrismaClient } from "@/generated/prisma/client";

// Funções implementadas nas tasks B.5–B.9 (sequenciais — mesmo arquivo).
export type { PrismaClient as _PC }; // evita "no exports" no TS até as funções serem adicionadas

// Placeholder — substituído em B.5
export async function queryPedidosPeriodo(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalPedidos: number; valorTotal: number }> {
  throw new Error("not implemented");
}

// Placeholder — substituído em B.6
export async function queryPedidosPorEtapa(
  _prisma: PrismaClient,
): Promise<{ linhas: { etapaNome: string | null; etapaFinaliza: boolean; quantidade: number; valorTotal: number }[] }> {
  throw new Error("not implemented");
}

// Placeholder — substituído em B.7
export async function queryPedidosPorVendedor(
  _prisma: PrismaClient,
  _filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ linhas: { vendedorNome: string | null; quantidade: number; valorTotal: number }[] }> {
  throw new Error("not implemented");
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
