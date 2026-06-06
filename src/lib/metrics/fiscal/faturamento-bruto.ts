import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";

/**
 * FATURAMENTO_BRUTO: quanto se tentou faturar, todas as notas de SAIDA emitidas
 * no periodo, sem filtrar situacao nem natureza. Fonte: fato_nota_fiscal.
 * Data: dataEmissao. Valor: SUM(vrNf). Inclui canceladas e nao-autorizadas.
 */
export async function faturamentoBruto(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const where = {
    entradaSaida: "1",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ _sum: { vrNf: true }, where }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
