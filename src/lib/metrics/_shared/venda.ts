import type { Prisma } from "../../../generated/prisma/client";

/**
 * A REGRA DE "SO VENDA" DA PLATAFORMA, em forma de where.
 *
 * A verdade vive em `lib/fiscal/regras/nota-venda-externa.ts` (funcao pura) e e
 * MATERIALIZADA pelo worker em `fato_nota_fiscal.is_venda_externa`: saida + autorizada +
 * modelo 55/65 + OPERACAO de venda (contem "venda", NAO contem "interna", finalidade <> '4')
 * + destinatario fora do grupo. Quem consulta so le a coluna , metricas (agente Nex/MCP),
 * relatorios e dashboard da diretoria olham para o MESMO campo, entao nao ha como dois
 * lugares darem numeros diferentes para a mesma pergunta.
 *
 * Conferido contra o Odoo pelo dono: julho/2026, grupo = R$ 7.242.504,80 em 136 notas.
 */
export const SO_VENDA_EXTERNA = { isVendaExterna: true } as const;

/** Mesmo recorte, tipado como where de fato_nota_fiscal. */
export function buildVendaExternaWhere(): Prisma.FatoNotaFiscalWhereInput {
  return { isVendaExterna: true };
}

/**
 * Recorte de venda no grao de ITEM (fato_nota_fiscal_item, com operacao/finalidade
 * desnormalizadas da nota-mae). O item nao tem a coluna materializada, entao aplica a mesma
 * regra pelos campos: saida autorizada + operacao de venda, nao interna, sem devolucao.
 * Nao aplica o corte de intragrupo (que vive na nota) , use-o quando o numero precisar
 * fechar com o KPI de faturamento.
 */
export function buildVendaOperacaoWhereItem(): Prisma.FatoNotaFiscalItemWhereInput {
  return {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    operacaoNome: { contains: "venda", mode: "insensitive" },
    NOT: [{ operacaoNome: { contains: "interna", mode: "insensitive" } }],
    finalidadeNfe: { not: "4" },
  };
}
