import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";

/**
 * FATURAMENTO_AUTORIZADO_TOTAL: toda saida autorizada (venda + devolucao +
 * transferencia, SEM excluir as nao-venda). E a parcela 1.2 do fechamento
 * BRUTO = AUTORIZADO_TOTAL + IMPACTO_CANCELAMENTOS + NAO_AUTORIZADO.
 * Fonte: fato_nota_fiscal. Data: dataEmissao. Valor: SUM(vrNf).
 */
export async function faturamentoAutorizadoTotal(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const where = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ _sum: { vrNf: true }, where }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
