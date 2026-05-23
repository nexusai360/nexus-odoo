// Helpers de busca tolerante a acento/grafia para queries de relatorio.
//
// Estrategia em camadas:
// 1. unaccent + lower em ambos os lados (match exato/parcial sem acento).
// 2. Se < 4 ids retornaram, faz fallback com pg_trgm (similarity >= 0.30)
//    para tolerar grafia errada (ex.: "aco" vs "aço", "arco" vs "aço").
//
// Indices funcionais ja foram criados na migration 20260523090100_search_unaccent_trgm.
//
// Funcao isolada para nao quebrar o uso de Prisma findMany no caller; o caller
// pega os ids retornados aqui e filtra `produtoId IN ids`.

import type { PrismaClient } from "@/generated/prisma/client";

const LIMITE = 50;

export async function searchProductIdsByName(
  prisma: PrismaClient,
  termo: string,
): Promise<number[]> {
  const t = termo.trim();
  if (!t) return [];

  // 1) match por unaccent
  const exact = await prisma.$queryRawUnsafe<{ produto_id: number }[]>(
    `SELECT DISTINCT produto_id FROM fato_estoque_saldo
     WHERE produto_id IS NOT NULL
       AND lower(public.f_unaccent_immutable(produto_nome))
           LIKE '%' || lower(public.f_unaccent_immutable($1)) || '%'
     LIMIT ${LIMITE}`,
    t,
  );
  const ids = new Set<number>(exact.map((r) => r.produto_id));

  if (ids.size >= 4) return Array.from(ids);

  // 2) fallback fuzzy (pg_trgm) para grafia errada
  const fuzzy = await prisma.$queryRawUnsafe<{ produto_id: number }[]>(
    `SELECT DISTINCT produto_id FROM fato_estoque_saldo
     WHERE produto_id IS NOT NULL
       AND similarity(
             lower(public.f_unaccent_immutable(produto_nome)),
             lower(public.f_unaccent_immutable($1))
           ) >= 0.30
     ORDER BY produto_id
     LIMIT ${LIMITE}`,
    t,
  );
  for (const r of fuzzy) ids.add(r.produto_id);

  return Array.from(ids);
}
