// src/lib/reports/queries/cadastros.ts
//
// Núcleo de agregação de cadastros, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_parceiro (clientes, fornecedores, contatos).

import type { PrismaClient } from "@/generated/prisma/client";

export async function queryBuscarParceiro(
  _prisma: PrismaClient,
  _filtros: { termo: string; limite?: number },
): Promise<{ linhas: { odooId: number; nome: string | null; documento: string | null; ehCliente: boolean; ehFornecedor: boolean; uf: string | null; cidade: string | null }[] }> {
  throw new Error("not implemented");
}

export async function queryParceirosPorUf(
  _prisma: PrismaClient,
  _filtros: { apenasClientes?: boolean },
): Promise<{ linhas: { uf: string | null; quantidade: number }[] }> {
  throw new Error("not implemented");
}

export async function queryContarParceiros(
  _prisma: PrismaClient,
): Promise<{ totalParceiros: number; totalClientes: number; totalFornecedores: number; totalEmpresas: number }> {
  throw new Error("not implemented");
}
