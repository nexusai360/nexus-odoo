import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";

export interface CfopLinha {
  cfopId: number | null;
  cfopNome: string | null;
  totalLinhas: number;
  valor: number;
}

export interface FaturamentoPorCfopResultado {
  linhas: CfopLinha[];
  total: number;
  valorGeral: number;
}

/**
 * FATURAMENTO_POR_CFOP. Fonte: fato_nota_fiscal_item (CFOP vive no item). Usa os
 * campos desnormalizados no item pelo Bloco A (entradaSaida, situacaoNfe, dataEmissao,
 * empresaId) para filtrar SEM join com a nota-mae nem documentoId IN (...). Valor =
 * SUM(item.vrNf) rateado (nunca cabecalho x num itens). Agrupa por cfopId via groupBy
 * no banco (chave raramente nula). Fechamento por TOLERANCIA, nao exato (rateio).
 * CFOP de saida = 5/6/7.xxx. Ranking trava em limit/offset.
 */
export async function faturamentoPorCfop(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoPorCfopResultado> {
  const where: Prisma.FatoNotaFiscalItemWhereInput = { entradaSaida: "1", situacaoNfe: "autorizada" };
  if (input.periodoDe && input.periodoAte) {
    const ateMais1 = new Date(`${input.periodoAte}T00:00:00Z`);
    ateMais1.setUTCDate(ateMais1.getUTCDate() + 1);
    where.dataEmissao = { gte: new Date(`${input.periodoDe}T00:00:00Z`), lt: ateMais1 };
  }
  if (input.empresaId !== undefined) where.empresaId = input.empresaId;

  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["cfopId"],
    _sum: { vrNf: true },
    _count: true,
    where,
  });

  const ids = grupos.map((g) => g.cfopId).filter((x): x is number => x !== null);
  const nomeRows = ids.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: ids } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const nomePorId = new Map(nomeRows.map((r) => [r.cfopId, r.cfopNome]));

  let linhas: CfopLinha[] = grupos
    .map((g) => ({
      cfopId: g.cfopId,
      cfopNome: g.cfopId === null ? null : (nomePorId.get(g.cfopId) ?? null),
      totalLinhas: g._count,
      valor: Number(g._sum.vrNf ?? 0),
    }))
    .sort((a, b) => b.valor - a.valor);

  const valorGeral = linhas.reduce((s, x) => s + x.valor, 0);
  const total = linhas.length;
  if (input.limit !== undefined) {
    const off = input.offset ?? 0;
    linhas = linhas.slice(off, off + input.limit);
  }
  return { linhas, total, valorGeral };
}
