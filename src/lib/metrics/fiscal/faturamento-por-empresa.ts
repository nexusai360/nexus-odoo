import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoEmpresaLinha } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { idsNaoVenda, buildNaturezaVendaWhere } from "../_shared/naturezas";

export interface FaturamentoPorEmpresaResultado {
  linhas: FaturamentoEmpresaLinha[];
  totalGrupo: number;
  empresasComFaturamento: number;
  valorSemEmpresa: number;
  totalNotasSemEmpresa: number;
}

/**
 * FATURAMENTO_POR_EMPRESA (comparativo de filiais). Faturamento de venda autorizado
 * agrupado SO por empresaId (nunca pelo par empresaId+empresaNome, que inflaria a
 * contagem quando o nome desnormalizado diverge). Nome resolvido em 2o passo pela
 * dim_empresa_grupo (odooId), com fallback ao empresaNome do fato. A linha empresaId=null
 * vira bucket "sem empresa" e fica por ultimo. NAO recebe filtro de empresa (lista todas).
 */
export async function faturamentoPorEmpresa(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoPorEmpresaResultado> {
  const naoVenda = await idsNaoVenda(prisma);
  const where = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildNaturezaVendaWhere(naoVenda),
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
  };
  const rows = await prisma.fatoNotaFiscal.findMany({
    where,
    select: { empresaId: true, vrNf: true, empresaNome: true },
  });

  const map = new Map<number | null, { totalNotas: number; valor: number; empresaNomeFato: string | null }>();
  for (const r of rows) {
    const k = r.empresaId;
    const cur = map.get(k) ?? { totalNotas: 0, valor: 0, empresaNomeFato: null };
    cur.totalNotas += 1;
    cur.valor += Number(r.vrNf ?? 0);
    if (r.empresaNome) cur.empresaNomeFato = r.empresaNome;
    map.set(k, cur);
  }

  const idsNaoNulos = [...map.keys()].filter((k): k is number => k !== null);
  const dims = idsNaoNulos.length
    ? await prisma.dimEmpresaGrupo.findMany({ where: { odooId: { in: idsNaoNulos } }, select: { odooId: true, nome: true } })
    : [];
  const nomePorId = new Map(dims.map((d) => [d.odooId, d.nome]));

  const linhas: FaturamentoEmpresaLinha[] = [...map.entries()].map(([empresaId, v]) => ({
    empresaId,
    empresaNome: empresaId === null ? null : (nomePorId.get(empresaId) ?? v.empresaNomeFato),
    totalNotas: v.totalNotas,
    valor: v.valor,
  }));
  linhas.sort((a, b) => {
    if (a.empresaId === null) return 1;
    if (b.empresaId === null) return -1;
    return b.valor - a.valor;
  });

  const totalGrupo = linhas.reduce((s, x) => s + x.valor, 0);
  const semEmpresa = map.get(null);
  return {
    linhas,
    totalGrupo,
    empresasComFaturamento: idsNaoNulos.length,
    valorSemEmpresa: semEmpresa?.valor ?? 0,
    totalNotasSemEmpresa: semEmpresa?.totalNotas ?? 0,
  };
}
