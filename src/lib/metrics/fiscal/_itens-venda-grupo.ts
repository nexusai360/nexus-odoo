import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop } from "../../fiscal/regras";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

/**
 * CORE compartilhado da Fase 2.5: carrega os itens de venda (saida autorizada) ja
 * classificados (ehReceita via CFOP) e marcados como intragrupo (whitelist->cadastro->
 * nome), mais a marcacao POR NOTA (preserva a contagem de notasIntragrupo/notasExternas
 * identica a receitaConsolidada original). SEM $queryRaw: groupBy nativo no item +
 * findMany de notas + join em memoria por documentoId. Reusado por receitaConsolidada,
 * faturamentoSerieMensal e faturamentoPorClienteCanon , garante periodo, base e definicao
 * de intragrupo IDENTICOS nas tres metricas.
 *
 * Premissa validada no cache (2026-06-10): data_emissao e sempre meia-noite UTC (0 notas
 * com hora != 0), logo getUTCMonth() nao tem off-by-one de fuso.
 */
export interface ItemVendaGrupo {
  documentoId: number | null;
  cfopId: number | null;
  valorProdutos: number;
  ehReceita: boolean;
  intragrupo: boolean;
  participanteId: number | null;
  participanteNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
  mesEmissao: number | null; // 1..12 (UTC) ou null
}

export interface MarcacaoNota {
  intragrupo: boolean;
  participanteId: number | null;
  participanteNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
}

export interface ItensVendaGrupoResultado {
  itens: ItemVendaGrupo[];
  marcacaoPorNota: Map<number, MarcacaoNota>;
  participantesGrupo: Set<number>;
}

export async function carregarItensVendaComGrupo(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<ItensVendaGrupoResultado> {
  const whereCommon = {
    entradaSaida: "1" as const,
    situacaoNfe: "autorizada" as const,
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };

  // (a) groupBy item por documentoId+cfopId
  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["documentoId", "cfopId"],
    _sum: { vrProdutos: true },
    _count: true,
    where: whereCommon as Prisma.FatoNotaFiscalItemWhereInput,
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

  // (c) notas do mesmo recorte -> marcacao intragrupo + data (Map, sem O(n*m))
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: whereCommon as Prisma.FatoNotaFiscalWhereInput,
    select: {
      odooId: true,
      participanteId: true,
      participanteNome: true,
      empresaId: true,
      empresaNome: true,
      dataEmissao: true,
    },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  const marcacaoPorNota = new Map<number, MarcacaoNota>();
  const dataPorNota = new Map<number, Date | null>();
  for (const n of notas) {
    marcacaoPorNota.set(n.odooId, {
      intragrupo: ehNotaIntragrupo(n, participantesGrupo),
      participanteId: n.participanteId,
      participanteNome: n.participanteNome,
      empresaId: n.empresaId,
      empresaNome: n.empresaNome,
    });
    dataPorNota.set(n.odooId, n.dataEmissao ?? null);
  }

  // (d) montar itens com flag/data resolvidas via Map
  const itens: ItemVendaGrupo[] = grupos.map((g) => {
    const m = g.documentoId !== null ? marcacaoPorNota.get(g.documentoId) : undefined;
    const data = g.documentoId !== null ? dataPorNota.get(g.documentoId) ?? null : null;
    return {
      documentoId: g.documentoId,
      cfopId: g.cfopId,
      valorProdutos: Number(g._sum.vrProdutos ?? 0),
      ehReceita: g.cfopId !== null ? (ehReceitaPorCfop.get(g.cfopId) ?? false) : false,
      intragrupo: m?.intragrupo ?? false,
      participanteId: m?.participanteId ?? null,
      participanteNome: m?.participanteNome ?? null,
      empresaId: m?.empresaId ?? null,
      empresaNome: m?.empresaNome ?? null,
      mesEmissao: data ? data.getUTCMonth() + 1 : null,
    };
  });

  return { itens, marcacaoPorNota, participantesGrupo };
}
