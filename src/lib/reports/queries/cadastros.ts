// src/lib/reports/queries/cadastros.ts
//
// Núcleo de agregação de cadastros, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_parceiro (clientes, fornecedores, contatos).

import type { PrismaClient } from "@/generated/prisma/client";
import {
  searchPartnerIdsByName,
  searchPartnerIdsByFullName,
} from "./_search-helpers";

// ---------------------------------------------------------------------------
// queryBuscarParceiro
// ---------------------------------------------------------------------------

/** Busca parceiros tolerante a acento/grafia/ordem das palavras.
 * - Tenta nome + nome_completo via busca fuzzy universal (tokenizacao AND
 *   + unaccent + fallback pg_trgm).
 * - Documento (CNPJ/CPF) entra como fallback final via match parcial direto
 *   (numeros nao se beneficiam de fuzzy mas vale match parcial).
 *
 * EXCECAO DE PAGINACAO (alavanca 2b): esta busca UNE ids de varios caminhos
 * (nome curto + nome completo + documento), entao limit/offset nao podem ir
 * direto pro SQL como take/skip. O conjunto encontrado e fechado primeiro
 * (cada caminho ja vem capado em ~50 pelo fuzzy interno), ordenado de forma
 * ESTAVEL por odooId, e a fatia [offset, offset+limit) e feita em memoria.
 * `total` = tamanho do conjunto encontrado. */
export async function queryBuscarParceiro(
  prisma: PrismaClient,
  filtros: { termo: string; limit: number; offset: number },
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
  total: number;
}> {
  const { limit, offset } = filtros;
  const termo = filtros.termo.trim();

  if (!termo) return { linhas: [], total: 0 };

  // Une ids dos dois caminhos (nome curto + nome completo). Cada caminho ja
  // vem capado em ~50 pelo fuzzy interno.
  const [idsByNome, idsByFull] = await Promise.all([
    searchPartnerIdsByName(prisma, termo),
    searchPartnerIdsByFullName(prisma, termo),
  ]);
  const idSet = new Set<number>([...idsByNome, ...idsByFull]);

  // Fallback documento: numeros e formatos com pontuacao. Match parcial
  // ILIKE direto cobre os casos tipicos (so digitos, so pontos, ou parcial).
  // Cap defensivo de 50 alinhado aos demais caminhos.
  const porDocumento = await prisma.fatoParceiro.findMany({
    where: {
      documento: { contains: termo, mode: "insensitive" },
      odooId: { notIn: Array.from(idSet) },
    },
    select: { odooId: true },
    take: 50,
  });
  for (const r of porDocumento) idSet.add(r.odooId);

  if (idSet.size === 0) return { linhas: [], total: 0 };

  // Ordena os ids de forma estavel (asc) e fatia a pagina em memoria. Fetch
  // so dos ids da pagina mantem o payload enxuto.
  const idsOrdenados = Array.from(idSet).sort((a, b) => a - b);
  const total = idsOrdenados.length;
  const idsDaPagina = idsOrdenados.slice(offset, offset + limit);

  if (idsDaPagina.length === 0) return { linhas: [], total };

  const rows = await prisma.fatoParceiro.findMany({
    where: { odooId: { in: idsDaPagina } },
    select: {
      odooId: true,
      nome: true,
      documento: true,
      ehCliente: true,
      ehFornecedor: true,
      uf: true,
      cidade: true,
    },
  });
  // findMany IN nao garante ordem; reordena pela mesma chave estavel.
  const linhas = rows.sort((a, b) => a.odooId - b.odooId);
  return { linhas, total };
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

/** Conta totais de parceiros segmentado por tipo, natureza e status. */
export async function queryContarParceiros(
  prisma: PrismaClient,
): Promise<{
  totalParceiros: number;
  totalClientes: number;
  totalFornecedores: number;
  totalEmpresas: number;
  totalPessoasFisicas: number;
  totalAtivos: number;
  totalInativos: number;
  totalClientesAtivos: number;
  totalFornecedoresAtivos: number;
}> {
  const [
    totalParceiros,
    totalClientes,
    totalFornecedores,
    totalEmpresas,
    totalPessoasFisicas,
    totalAtivos,
    totalInativos,
    totalClientesAtivos,
    totalFornecedoresAtivos,
  ] = await Promise.all([
    prisma.fatoParceiro.count(),
    prisma.fatoParceiro.count({ where: { ehCliente: true } }),
    prisma.fatoParceiro.count({ where: { ehFornecedor: true } }),
    prisma.fatoParceiro.count({ where: { ehEmpresa: true } }),
    prisma.fatoParceiro.count({ where: { ehEmpresa: false } }),
    prisma.fatoParceiro.count({ where: { ativo: true } }),
    prisma.fatoParceiro.count({ where: { ativo: false } }),
    prisma.fatoParceiro.count({
      where: { ehCliente: true, ativo: true },
    }),
    prisma.fatoParceiro.count({
      where: { ehFornecedor: true, ativo: true },
    }),
  ]);
  return {
    totalParceiros,
    totalClientes,
    totalFornecedores,
    totalEmpresas,
    totalPessoasFisicas,
    totalAtivos,
    totalInativos,
    totalClientesAtivos,
    totalFornecedoresAtivos,
  };
}
