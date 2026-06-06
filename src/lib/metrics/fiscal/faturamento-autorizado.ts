import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { idsNaoVenda, buildNaturezaVendaWhere } from "../_shared/naturezas";

/**
 * FATURAMENTO_AUTORIZADO (a definicao canonica de "faturamento" do dono).
 * Fonte: fato_nota_fiscal. Regra: notas de SAIDA (entradaSaida='1') com situacao
 * AUTORIZADA, excluindo operacoes nao-venda (devolucao, transferencia, remessa, etc.,
 * via idsNaoVenda). Data de referencia: dataEmissao (fato gerador). Valor: SUM(vrNf).
 * Exclui canceladas, nao-autorizadas e operacoes que nao sao venda.
 */
export async function faturamentoAutorizado(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  const naoVenda = await idsNaoVenda(prisma);
  const where = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
    ...buildNaturezaVendaWhere(naoVenda),
  };
  const [agg, totalNotas] = await Promise.all([
    prisma.fatoNotaFiscal.aggregate({ _sum: { vrNf: true }, where }),
    prisma.fatoNotaFiscal.count({ where }),
  ]);
  return { totalNotas, valor: Number(agg._sum.vrNf ?? 0) };
}
