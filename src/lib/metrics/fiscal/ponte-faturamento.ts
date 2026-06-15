import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import type { CategoriaGerencial } from "../../fiscal/regras";
import { faturamentoPorCfop } from "./faturamento-por-cfop";
import { receitaConsolidada } from "./receita-consolidada";

/**
 * PONTE DE RECONCILIACAO (Fase 3). Compoe as metricas canonicas (faturamentoPorCfop +
 * receitaConsolidada) numa ponte/waterfall que mostra como o faturamento bruto vira a
 * receita externa real:
 *   bruto (todas saidas autorizadas, vrProdutos no item)
 *    (-) nao-receita (transferencia, devolucao, remessa, sem_cfop, outras, ...)
 *    = receita individual (venda+servico+exportacao)
 *    (-) intragrupo eliminavel (CPC 36)
 *    = receita externa real
 * Nao recalcula nada: compoe metricas que ja reconciliam (identidade fecha ao centavo).
 * A ordem das deducoes e apenas apresentacional (a soma e aditiva).
 */
export interface PonteDeducao {
  categoria: CategoriaGerencial;
  rotulo: string;
  valor: number;
}

export interface PonteFaturamentoResultado {
  brutoProdutos: number;
  deducoesNaoReceita: PonteDeducao[];
  totalNaoReceita: number;
  receitaIndividual: number;
  intragrupoEliminavel: number;
  receitaExterna: number;
  /** percentual eliminado sobre a receita individual (para o aviso de "concentrador"). */
  percentualEliminado: number;
  /** true quando a identidade da ponte fecha (bruto-naoReceita-intragrupo==externa E as
   *  duas definicoes de receita individual batem). */
  reconciliado: boolean;
}

const TOL = 0.5;

export async function ponteFaturamento(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<PonteFaturamentoResultado> {
  const f1 = await faturamentoPorCfop(prisma, { agruparPor: "categoria", ...input });
  const rc = await receitaConsolidada(prisma, input);

  const deducoesNaoReceita: PonteDeducao[] = f1.linhas
    .filter((l) => !l.ehReceita)
    .map((l) => ({ categoria: l.categoria, rotulo: l.rotulo, valor: l.valorProdutos }))
    .sort((a, b) => b.valor - a.valor);

  const brutoProdutos = f1.totalProdutos;
  const totalNaoReceita = f1.totalNaoReceita;
  const receitaIndividual = f1.totalReceita;
  const intragrupoEliminavel = rc.receitaIntragrupoEliminavel;
  const receitaExterna = rc.receitaExterna;
  const percentualEliminado = receitaIndividual > 0 ? intragrupoEliminavel / receitaIndividual : 0;

  const identidadePonte = Math.abs(brutoProdutos - totalNaoReceita - intragrupoEliminavel - receitaExterna) < TOL;
  const individualBate = Math.abs(receitaIndividual - rc.receitaIndividualTotal) < TOL;
  const reconciliado = identidadePonte && individualBate;

  return {
    brutoProdutos,
    deducoesNaoReceita,
    totalNaoReceita,
    receitaIndividual,
    intragrupoEliminavel,
    receitaExterna,
    percentualEliminado,
    reconciliado,
  };
}
