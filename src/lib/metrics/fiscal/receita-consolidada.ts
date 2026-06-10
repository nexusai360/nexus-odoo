import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";

export interface ReceitaConsolidadaResultado {
  receitaExterna: number;
  receitaIntragrupoEliminavel: number;
  receitaIndividualTotal: number;
  intercompanyBrutoVrProdutos: number;
  notasIntragrupo: number;
  notasExternas: number;
  percentualEliminado: number; // receitaIntragrupoEliminavel / receitaIndividualTotal
}

/**
 * RECEITA CONSOLIDADA EXTERNA (visao C, CPC 36). Combina a classificacao fiscal da
 * Fase 1 (ehReceita via cfopId) com a marcacao intercompany (participante da nota,
 * cascata whitelist->cadastro->nome). Fase 2.5: delega o join ao core compartilhado
 * `carregarItensVendaComGrupo` (groupBy item + findMany notas, sem $queryRaw) , a saida
 * permanece IDENTICA (reconciliacao receitaIndividualTotal == F1.totalReceita, travada
 * no E2E f2-receita-consolidada e na conferencia I3/I4).
 */
export async function receitaConsolidada(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<ReceitaConsolidadaResultado> {
  const { itens, marcacaoPorNota } = await carregarItensVendaComGrupo(prisma, input);

  let receitaExterna = 0;
  let receitaIntragrupoEliminavel = 0;
  let intercompanyBrutoVrProdutos = 0;
  for (const it of itens) {
    if (it.intragrupo) intercompanyBrutoVrProdutos += it.valorProdutos;
    if (it.ehReceita) {
      if (it.intragrupo) receitaIntragrupoEliminavel += it.valorProdutos;
      else receitaExterna += it.valorProdutos;
    }
  }
  const receitaIndividualTotal = receitaExterna + receitaIntragrupoEliminavel;

  let notasIntragrupo = 0;
  let notasExternas = 0;
  for (const m of marcacaoPorNota.values()) {
    if (m.intragrupo) notasIntragrupo++;
    else notasExternas++;
  }

  const percentualEliminado =
    receitaIndividualTotal > 0 ? receitaIntragrupoEliminavel / receitaIndividualTotal : 0;

  return {
    receitaExterna,
    receitaIntragrupoEliminavel,
    receitaIndividualTotal,
    intercompanyBrutoVrProdutos,
    notasIntragrupo,
    notasExternas,
    percentualEliminado,
  };
}
