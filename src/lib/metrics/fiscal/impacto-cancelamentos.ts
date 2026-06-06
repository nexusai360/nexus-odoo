import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";

/**
 * IMPACTO_CANCELAMENTOS: total das notas de SAIDA canceladas. Parcela do
 * fechamento BRUTO. Fonte: fato_nota_fiscal. Data: dataEmissao (uma nota emitida
 * em janeiro e cancelada em marco conta no periodo de janeiro, pela emissao).
 * Valor: SUM(vrNf).
 */
export async function impactoCancelamentos(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const where = {
    entradaSaida: "1",
    situacaoNfe: "cancelada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ _sum: { vrNf: true }, where }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
