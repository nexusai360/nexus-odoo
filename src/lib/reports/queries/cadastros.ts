// src/lib/reports/queries/cadastros.ts
//
// Núcleo de agregação de cadastros, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_parceiro (clientes, fornecedores, contatos).

import type { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// queryBuscarParceiro
// ---------------------------------------------------------------------------

/** Busca parceiros por nome, nomeCompleto ou documento via ILIKE.
 * Devolve até `limite` (padrão 20) resultados. */
export async function queryBuscarParceiro(
  prisma: PrismaClient,
  filtros: { termo: string; limite?: number },
): Promise<{
  linhas: {
    odooId: number;
    nome: string | null;
    documento: string | null;
    ehCliente: boolean;
    ehFornecedor: boolean;
    uf: string | null;
    cidade: string | null;
  }[];
}> {
  const limite = filtros.limite ?? 20;
  const linhas = await prisma.fatoParceiro.findMany({
    where: {
      OR: [
        { nome: { contains: filtros.termo, mode: "insensitive" } },
        { nomeCompleto: { contains: filtros.termo, mode: "insensitive" } },
        { documento: { contains: filtros.termo, mode: "insensitive" } },
      ],
    },
    select: {
      odooId: true,
      nome: true,
      documento: true,
      ehCliente: true,
      ehFornecedor: true,
      uf: true,
      cidade: true,
    },
    take: limite,
  });
  return { linhas };
}

// ---------------------------------------------------------------------------
// queryParceirosPorUf
// ---------------------------------------------------------------------------

/** Agrupa parceiros por UF e devolve ordenado por quantidade desc.
 * Quando `apenasClientes=true`, filtra apenas registros com ehCliente=true. */
export async function queryParceirosPorUf(
  prisma: PrismaClient,
  filtros: { apenasClientes?: boolean },
): Promise<{ linhas: { uf: string | null; quantidade: number }[] }> {
  const rows = await prisma.fatoParceiro.findMany({
    where: filtros.apenasClientes ? { ehCliente: true } : undefined,
    select: { uf: true },
  });

  // Agrupa em memória (Prisma não suporta groupBy com null em todos os drivers)
  const map = new Map<string | null, number>();
  for (const row of rows) {
    const key = row.uf;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const linhas = [...map.entries()]
    .map(([uf, quantidade]) => ({ uf, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return { linhas };
}

// ---------------------------------------------------------------------------
// queryContarParceiros
// ---------------------------------------------------------------------------

/** Conta totais de parceiros, clientes, fornecedores e empresas. */
export async function queryContarParceiros(
  prisma: PrismaClient,
): Promise<{
  totalParceiros: number;
  totalClientes: number;
  totalFornecedores: number;
  totalEmpresas: number;
}> {
  const [totalParceiros, totalClientes, totalFornecedores, totalEmpresas] =
    await Promise.all([
      prisma.fatoParceiro.count(),
      prisma.fatoParceiro.count({ where: { ehCliente: true } }),
      prisma.fatoParceiro.count({ where: { ehFornecedor: true } }),
      prisma.fatoParceiro.count({ where: { ehEmpresa: true } }),
    ]);
  return { totalParceiros, totalClientes, totalFornecedores, totalEmpresas };
}
