import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

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
    AND: [
      { operacaoNome: { contains: "venda", mode: "insensitive" } },
      { NOT: [{ operacaoNome: { contains: "interna", mode: "insensitive" } }] },
      { NOT: [{ operacaoNome: { contains: "imobilizado", mode: "insensitive" } }] },
      { finalidadeNfe: { not: "4" } },
    ],
  };
}

/**
 * Where das notas de VENDA no grao de nota, SEM o corte de intragrupo , o universo que a
 * receita consolidada precisa (ela separa externa de intragrupo eliminavel). E a mesma
 * regra que materializa `is_venda_externa`, menos o corte de destinatario: saida +
 * autorizada + modelo 55/65 + operacao de venda (nao interna, nao imobilizado, sem
 * devolucao).
 */
export function buildVendaOperacaoWhereNota(): Prisma.FatoNotaFiscalWhereInput {
  return {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    modelo: { in: ["55", "65"] },
    AND: [
      { operacaoNome: { contains: "venda", mode: "insensitive" } },
      { NOT: [{ operacaoNome: { contains: "interna", mode: "insensitive" } }] },
      { NOT: [{ operacaoNome: { contains: "imobilizado", mode: "insensitive" } }] },
      { finalidadeNfe: { not: "4" } },
    ],
  };
}

/**
 * Gap de cadastro: notas de saida autorizada (modelo de venda) SEM operacao no cache. Elas
 * nao entram no faturamento (a regra exige a operacao), entao o numero precisa ser
 * observavel , se crescer, e cadastro quebrado no Odoo, nao receita que evaporou.
 *
 * O piso da data de inicio das analises entra por um AND proprio, e nao por default do
 * `recorte`: assim ele vale mesmo quando o chamador manda um recorte sem periodo (era a
 * armadilha , o default {} varria as notas de todo o historico) e nao ha como sobrescreve-lo
 * sem querer. O `recorte` continua servindo para ESTREITAR (periodo via buildPeriodoWhere,
 * empresa, etc.), nunca para alargar.
 */
export async function contarNotasSemOperacao(
  prisma: PrismaClient,
  recorte: Prisma.FatoNotaFiscalWhereInput = {},
): Promise<{ totalNotas: number; valor: number }> {
  const andDoRecorte = recorte.AND
    ? Array.isArray(recorte.AND)
      ? recorte.AND
      : [recorte.AND]
    : [];
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: {
      entradaSaida: "1",
      situacaoNfe: "autorizada",
      modelo: { in: ["55", "65"] },
      operacaoNome: null,
      ...recorte,
      AND: [...andDoRecorte, { dataEmissao: { gte: corteAtualDate() } }],
    },
    select: { vrNf: true },
  });
  const valor = notas.reduce((s, n) => s + Number(n.vrNf), 0);
  return { totalNotas: notas.length, valor: Math.round(valor * 100) / 100 };
}
