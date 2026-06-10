import type { PrismaClient } from "../../../generated/prisma/client";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";

/**
 * Serie mensal de faturamento (Fase 2.5). Sobre o core compartilhado: para cada mes do
 * ano, separa receita externa (sem intercompany) de intragrupo eliminavel. Substitui o
 * loop antigo de queryFaturamentoPeriodo (base vrNf, sem eliminacao) por UMA chamada do
 * core + agregacao em memoria. `notasExternas` conta notas externas distintas com ao menos
 * um item de venda no mes.
 */
export interface SerieMensalLinha {
  mes: number;
  individual: number;
  externa: number;
  intragrupoEliminavel: number;
  notasExternas: number;
}

export interface FaturamentoSerieMensalResultado {
  ano: number;
  serie: SerieMensalLinha[];
  totalIndividualAno: number;
  totalExternaAno: number;
  totalNotasExternasAno: number;
}

export async function faturamentoSerieMensal(
  prisma: PrismaClient,
  input: { ano: number; empresaId?: number; mesLimite?: number },
): Promise<FaturamentoSerieMensalResultado> {
  const periodoDe = `${input.ano}-01-01`;
  const periodoAte = `${input.ano}-12-31`;
  const { itens, marcacaoPorNota } = await carregarItensVendaComGrupo(prisma, {
    periodoDe,
    periodoAte,
    empresaId: input.empresaId,
  });

  const limite = input.mesLimite ?? 12;
  const meses = new Map<number, SerieMensalLinha>();
  for (let m = 1; m <= limite; m++) {
    meses.set(m, { mes: m, individual: 0, externa: 0, intragrupoEliminavel: 0, notasExternas: 0 });
  }

  // (a) valores de venda por mes
  for (const it of itens) {
    if (it.mesEmissao === null || !meses.has(it.mesEmissao)) continue;
    if (!it.ehReceita) continue;
    const linha = meses.get(it.mesEmissao)!;
    linha.individual += it.valorProdutos;
    if (it.intragrupo) linha.intragrupoEliminavel += it.valorProdutos;
    else linha.externa += it.valorProdutos;
  }

  // (b) notas externas distintas com item de venda no mes
  const notaMes = new Map<number, number>();
  for (const it of itens) {
    if (it.documentoId === null || it.mesEmissao === null) continue;
    if (!it.ehReceita) continue;
    notaMes.set(it.documentoId, it.mesEmissao);
  }
  for (const [odooId, mes] of notaMes) {
    const mk = marcacaoPorNota.get(odooId);
    if (mk && !mk.intragrupo && meses.has(mes)) meses.get(mes)!.notasExternas++;
  }

  const serie = [...meses.values()];
  return {
    ano: input.ano,
    serie,
    totalIndividualAno: serie.reduce((s, l) => s + l.individual, 0),
    totalExternaAno: serie.reduce((s, l) => s + l.externa, 0),
    totalNotasExternasAno: serie.reduce((s, l) => s + l.notasExternas, 0),
  };
}
