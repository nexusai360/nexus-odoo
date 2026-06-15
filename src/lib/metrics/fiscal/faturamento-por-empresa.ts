import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoEmpresaLinha } from "../_shared/types";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";

export interface FaturamentoPorEmpresaResultado {
  linhas: FaturamentoEmpresaLinha[];
  totalGrupo: number;
  empresasComFaturamento: number;
  valorSemEmpresa: number;
  totalNotasSemEmpresa: number;
}

/**
 * FATURAMENTO_POR_EMPRESA (comparativo de filiais).
 *
 * Onda humanizacao 2026-06-12 (pericia da conversa a395702f): migrado da base
 * antiga (vrNf da NOTA + filtro por natureza de operacao) para a BASE CANONICA
 * da F2.5 (itens de venda, vrProdutos + ehReceita por CFOP, via
 * carregarItensVendaComGrupo). Motivo: no mesmo periodo o usuario recebia
 * R$ 10.010.579,32 aqui e R$ 9.737.728,54 no faturamento_periodo , dois
 * numeros para a mesma pergunta. Agora totalGrupo == receitaIndividual do
 * faturamento_periodo, ao centavo.
 *
 * Agrupado SO por empresaId (nunca pelo par empresaId+empresaNome, que inflaria
 * a contagem quando o nome desnormalizado diverge). Nome: o empresaNome da
 * propria nota (a dim_empresa_grupo tem odooId deslocado , ver historico).
 * A linha empresaId=null vira bucket "sem empresa" e fica por ultimo.
 */
export async function faturamentoPorEmpresa(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoPorEmpresaResultado> {
  const { itens } = await carregarItensVendaComGrupo(prisma, {
    periodoDe: input.periodoDe,
    periodoAte: input.periodoAte,
  });

  const map = new Map<
    number | null,
    { notas: Set<number>; valor: number; empresaNomeFato: string | null }
  >();
  for (const it of itens) {
    if (!it.ehReceita) continue;
    const k = it.empresaId;
    const cur = map.get(k) ?? { notas: new Set<number>(), valor: 0, empresaNomeFato: null };
    cur.valor += it.valorProdutos;
    if (it.documentoId !== null) cur.notas.add(it.documentoId);
    if (it.empresaNome) cur.empresaNomeFato = it.empresaNome;
    map.set(k, cur);
  }

  const idsNaoNulos = [...map.keys()].filter((k): k is number => k !== null);
  const linhas: FaturamentoEmpresaLinha[] = [...map.entries()].map(([empresaId, v]) => ({
    empresaId,
    empresaNome: empresaId === null ? null : (v.empresaNomeFato ?? `Empresa ${empresaId}`),
    totalNotas: v.notas.size,
    valor: Math.round(v.valor * 100) / 100,
  }));
  linhas.sort((a, b) => {
    if (a.empresaId === null) return 1;
    if (b.empresaId === null) return -1;
    return b.valor - a.valor;
  });

  const totalGrupo = Math.round(linhas.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const semEmpresa = map.get(null);
  return {
    linhas,
    totalGrupo,
    empresasComFaturamento: idsNaoNulos.length,
    valorSemEmpresa: semEmpresa ? Math.round(semEmpresa.valor * 100) / 100 : 0,
    totalNotasSemEmpresa: semEmpresa?.notas.size ?? 0,
  };
}
