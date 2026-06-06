import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";

/**
 * FATURAMENTO_ENTRADA: notas proprias de ENTRADA (compras) autorizadas.
 * Fonte: fato_nota_fiscal (entradaSaida='0'). ARMADILHA: estas sao as notas
 * proprias de entrada, NAO os DF-e de fornecedores (fato_dfe). A F1 nao soma
 * as duas fontes. Data: dataEmissao. Valor: SUM(vrNf).
 */
export async function faturamentoEntrada(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const where = {
    entradaSaida: "0",
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
