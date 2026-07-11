import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { SO_VENDA_EXTERNA } from "../_shared/venda";

/**
 * FATURAMENTO_AUTORIZADO (a definicao canonica de "faturamento" do dono).
 *
 * Fonte: fato_nota_fiscal, coluna materializada `is_venda_externa` , a MESMA verdade do
 * dashboard da diretoria e dos relatorios (uma regra so, em lib/fiscal/regras/
 * nota-venda-externa.ts, materializada pelo builder de classificacao do worker):
 * saida + autorizada + modelo 55/65 + OPERACAO de venda (contem "venda", nao contem
 * "interna", finalidade <> devolucao) + destinatario fora do grupo.
 *
 * Antes esta metrica filtrava por NATUREZA de operacao, e contava a VENDA INTERNA
 * (transferencia faturada entre empresas do grupo) como faturamento: "venda" e "venda
 * interna" tem a mesma natureza, so a operacao as separa.
 *
 * Data de referencia: dataEmissao (fato gerador). Valor: SUM(vrNf).
 */
export async function faturamentoAutorizado(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const where = {
    ...SO_VENDA_EXTERNA,
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ _sum: { vrNf: true }, where }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
