import type { Prisma, PrismaClient } from "../../../generated/prisma/client";

/**
 * Termos que marcam uma natureza de operacao como NAO-venda. O faturamento de venda
 * exclui essas operacoes (devolucao, transferencia, retorno, remessa, bonificacao,
 * comodato, demonstracao). Comparacao por substring sobre o nome normalizado.
 */
export const NATUREZAS_NAO_VENDA_TERMOS = [
  "devolu",
  "transfer",
  "retorno",
  "remessa",
  "bonifica",
  "comodato",
  "demonstra",
];

/** lowercase + remove acentos (NFD sem diacriticos), para casar "Devolução" e "devolucao". */
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Resolve, no dado, os ids de natureza de operacao que sao NAO-venda. Le os pares
 * distintos (naturezaOperacaoId, nome) de fato_nota_fiscal e marca os cujo nome
 * normalizado contem algum termo nao-venda. Retorna ids nao nulos.
 */
export async function idsNaoVenda(prisma: PrismaClient): Promise<number[]> {
  const rows = await prisma.fatoNotaFiscal.findMany({
    select: { naturezaOperacaoId: true, naturezaOperacaoNome: true },
    distinct: ["naturezaOperacaoId"],
  });
  const ids: number[] = [];
  for (const r of rows) {
    if (r.naturezaOperacaoId == null) continue;
    const nome = normalizar(r.naturezaOperacaoNome ?? "");
    if (NATUREZAS_NAO_VENDA_TERMOS.some((t) => nome.includes(t))) {
      ids.push(r.naturezaOperacaoId);
    }
  }
  return ids;
}

/** Where Prisma que exclui as naturezas nao-venda; {} quando a lista esta vazia. */
export function buildNaturezaVendaWhere(ids: number[]): Prisma.FatoNotaFiscalWhereInput {
  return ids.length ? { naturezaOperacaoId: { notIn: ids } } : {};
}
