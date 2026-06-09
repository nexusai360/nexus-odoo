import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { idsNaoVenda, buildNaturezaVendaWhere } from "../_shared/naturezas";

export interface OperacaoLinha {
  naturezaOperacaoId: number | null;
  naturezaOperacaoNome: string | null;
  ehVenda: boolean;
  totalNotas: number;
  valor: number;
}

export interface FaturamentoPorOperacaoResultado {
  linhas: OperacaoLinha[];
  total: number;
  valorGeral: number;
  valorVenda: number;
  valorNaoVenda: number;
}

/**
 * FATURAMENTO_POR_OPERACAO (natureza de operacao). Saida autorizada SEM excluir
 * nao-venda; cada natureza vira uma linha com a flag ehVenda (derivada de idsNaoVenda).
 * Agrupa por naturezaOperacaoId via findMany + Map (nulavel, nao usa groupBy). Nome
 * desnormalizado (nao depende de JOIN com a referencia). Ranking trava em limit/offset.
 */
export async function faturamentoPorOperacao(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoPorOperacaoResultado> {
  const naoVendaIds = await idsNaoVenda(prisma);
  const naoVenda = new Set(naoVendaIds);
  // FATURAMENTO por operacao = mesma base do faturamento (venda autorizada).
  // Aplica o MESMO filtro de venda do por_empresa/periodo (exclui nao-venda E
  // notas sem natureza), para os totais FECHAREM entre as quebras. Sem isto, a
  // quebra por operacao despejava transferencias/remessas/devolucoes e o total
  // nao batia com o faturamento (era "saida por operacao", nao "faturamento").
  const where = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildNaturezaVendaWhere(naoVendaIds),
    ...buildEmpresaWhere(input.empresaId),
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
  };
  const rows = await prisma.fatoNotaFiscal.findMany({
    where,
    select: { naturezaOperacaoId: true, naturezaOperacaoNome: true, vrNf: true },
  });

  const map = new Map<number | null, { nome: string | null; totalNotas: number; valor: number }>();
  for (const r of rows) {
    const k = r.naturezaOperacaoId;
    const cur = map.get(k) ?? { nome: null, totalNotas: 0, valor: 0 };
    cur.totalNotas += 1;
    cur.valor += Number(r.vrNf ?? 0);
    if (r.naturezaOperacaoNome) cur.nome = r.naturezaOperacaoNome;
    map.set(k, cur);
  }

  let linhas: OperacaoLinha[] = [...map.entries()]
    .map(([naturezaOperacaoId, v]) => ({
      naturezaOperacaoId,
      naturezaOperacaoNome: v.nome,
      ehVenda: naturezaOperacaoId === null ? true : !naoVenda.has(naturezaOperacaoId),
      totalNotas: v.totalNotas,
      valor: v.valor,
    }))
    .sort((a, b) => b.valor - a.valor);

  const valorGeral = linhas.reduce((s, x) => s + x.valor, 0);
  const valorVenda = linhas.filter((x) => x.ehVenda).reduce((s, x) => s + x.valor, 0);
  const total = linhas.length;
  if (input.limit !== undefined) {
    const off = input.offset ?? 0;
    linhas = linhas.slice(off, off + input.limit);
  }
  return { linhas, total, valorGeral, valorVenda, valorNaoVenda: valorGeral - valorVenda };
}
