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

export interface ReceitaPorEmpresa {
  empresaId: number | null;
  empresaNome: string | null;
  /** Faturamento REAL da empresa (vendas para fora do grupo). */
  receitaExterna: number;
  /** Vendas dessa empresa PARA outras do grupo (eliminadas do consolidado). */
  receitaIntragrupoEliminavel: number;
  /** Faturamento individual (externo + intragrupo) antes da eliminação. */
  receitaIndividualTotal: number;
}

/**
 * RECEITA CONSOLIDADA EXTERNA QUEBRADA POR EMPRESA, numa única passada.
 * Mesma classificação da `receitaConsolidada` (ehReceita + intragrupo), só que
 * agregada por empresa emissora. Evita que o agente chame a tool N vezes (uma por
 * empresa) para montar o "faturamento real por empresa". Ordena pelo real desc.
 */
export async function receitaConsolidadaPorEmpresa(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<ReceitaPorEmpresa[]> {
  const { itens } = await carregarItensVendaComGrupo(prisma, input);
  const map = new Map<string, ReceitaPorEmpresa>();
  for (const it of itens) {
    if (!it.ehReceita) continue;
    const key = String(it.empresaId ?? it.empresaNome ?? "?");
    let e = map.get(key);
    if (!e) {
      e = {
        empresaId: it.empresaId,
        empresaNome: it.empresaNome,
        receitaExterna: 0,
        receitaIntragrupoEliminavel: 0,
        receitaIndividualTotal: 0,
      };
      map.set(key, e);
    }
    if (it.intragrupo) e.receitaIntragrupoEliminavel += it.valorProdutos;
    else e.receitaExterna += it.valorProdutos;
    e.receitaIndividualTotal += it.valorProdutos;
  }
  return Array.from(map.values()).sort((a, b) => b.receitaExterna - a.receitaExterna);
}
