import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop } from "../../fiscal/regras";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

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
 * cascata doc->nome). SEM $queryRaw: groupBy nativo no item + findMany de notas,
 * join em memoria por documentoId. Mesmo recorte/classificacao da F1 (reconciliacao
 * receitaIndividualTotal == F1.totalReceita, verificada no E2E).
 */
export async function receitaConsolidada(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<ReceitaConsolidadaResultado> {
  const whereItem: Prisma.FatoNotaFiscalItemWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };

  // (a) groupBy item por documentoId+cfopId
  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["documentoId", "cfopId"],
    _sum: { vrProdutos: true },
    _count: true,
    where: whereItem,
  });

  // (b) nome representante por cfopId (igual F1) -> ehReceita
  const ids = [...new Set(grupos.map((g) => g.cfopId).filter((x): x is number => x !== null))];
  const nomeRows = ids.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: ids } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const ehReceitaPorCfop = new Map<number, boolean>();
  for (const r of nomeRows) {
    if (r.cfopId === null) continue;
    ehReceitaPorCfop.set(r.cfopId, classificarCfop(extrairCfop(r.cfopNome)).ehReceita);
  }

  // (c) notas do mesmo recorte -> marcacao intragrupo (cascata doc->nome)
  const whereNota: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: whereNota,
    select: { odooId: true, participanteId: true, participanteNome: true },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  const ehGrupoPorNota = new Map<number, boolean>();
  for (const n of notas) ehGrupoPorNota.set(n.odooId, ehNotaIntragrupo(n, participantesGrupo));

  // (d) join em memoria
  let receitaExterna = 0;
  let receitaIntragrupoEliminavel = 0;
  let intercompanyBrutoVrProdutos = 0;
  for (const g of grupos) {
    const valor = Number(g._sum.vrProdutos ?? 0);
    const ehGrupo = g.documentoId !== null ? (ehGrupoPorNota.get(g.documentoId) ?? false) : false;
    const ehReceita = g.cfopId !== null ? (ehReceitaPorCfop.get(g.cfopId) ?? false) : false;
    if (ehGrupo) intercompanyBrutoVrProdutos += valor;
    if (ehReceita) {
      if (ehGrupo) receitaIntragrupoEliminavel += valor;
      else receitaExterna += valor;
    }
  }
  const receitaIndividualTotal = receitaExterna + receitaIntragrupoEliminavel;

  let notasIntragrupo = 0;
  let notasExternas = 0;
  for (const eh of ehGrupoPorNota.values()) {
    if (eh) notasIntragrupo++;
    else notasExternas++;
  }

  const percentualEliminado = receitaIndividualTotal > 0 ? receitaIntragrupoEliminavel / receitaIndividualTotal : 0;

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
