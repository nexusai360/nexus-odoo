import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { carregarItensVendaComGrupo, type ItemVendaGrupo } from "./_itens-venda-grupo";
import { parseEmpresaNome } from "../_shared/empresa";
import { cnpjRaiz, regimeLabel } from "../../fiscal/regime/regime";

/**
 * FATURAMENTO POR REGIME TRIBUTARIO (Fase 5). Agrupa o faturamento (receita de venda
 * autorizada, base canonica `_itens-venda-grupo`) pelo regime tributario da empresa
 * EMITENTE. Regime vem de `dim_empresa_regime` (de-para CNPJ-raiz -> regime).
 *
 * Dois numeros por regime, porque o regime NAO permite eliminacao intragrupo (a venda
 * Real->Simples nao tem par no mesmo bucket): `receitaIndividual` (inclui intragrupo) e
 * `receitaExterna` (intragrupo eliminado, so o que sai do grupo). Reconcilia EXATO com
 * `receitaConsolidada` (mesma base, mesmos predicados):
 *   Sigma receitaIndividual (todos os regimes + nao_mapeado) == receitaIndividualTotal
 *   Sigma receitaExterna                                     == receitaExterna
 */

export const REGIME_NAO_MAPEADO = "nao_mapeado";

export interface EmpresaRegimeLinha {
  empresaId: number | null;
  empresaNome: string | null;
  receitaIndividual: number;
}

export interface RegimeLinha {
  regimeCodigo: string; // "1" | "2" | "3" | "3.1" | "4" | "nao_mapeado"
  regimeLabel: string;
  receitaIndividual: number;
  receitaExterna: number;
  qtdEmpresas: number;
  qtdNotas: number;
  empresas: EmpresaRegimeLinha[];
}

export interface FaturamentoPorRegimeResultado {
  regimes: RegimeLinha[];
  totalReceitaIndividual: number;
  totalReceitaExterna: number;
  receitaNaoMapeada: number; // receitaIndividual sem regime mapeado
  coberturaPercentual: number; // (individual mapeado) / (individual total)
  regimeSnapshotAtual: boolean; // regime e o enquadramento ATUAL (snapshot), nao do periodo
}

interface RegimeRef {
  codigo: string;
  label: string;
}

interface Acc {
  receitaIndividual: number;
  receitaExterna: number;
  empresas: Map<number | null, EmpresaRegimeLinha>;
  notas: Set<number>;
}

/**
 * Agregacao PURA (testavel isolada): recebe os itens canonicos ja classificados e o
 * de-para raiz->regime, devolve o resultado por regime. So conta itens `ehReceita`.
 */
export function agregarPorRegime(
  itens: ItemVendaGrupo[],
  regimePorRaiz: Map<string, RegimeRef>,
): FaturamentoPorRegimeResultado {
  const porRegime = new Map<string, Acc>();
  const getAcc = (k: string): Acc => {
    let a = porRegime.get(k);
    if (!a) {
      a = { receitaIndividual: 0, receitaExterna: 0, empresas: new Map(), notas: new Set() };
      porRegime.set(k, a);
    }
    return a;
  };

  for (const it of itens) {
    if (!it.ehReceita) continue;
    const cnpj = parseEmpresaNome(it.empresaId ?? 0, it.empresaNome).cnpj;
    const raiz = cnpjRaiz(cnpj);
    const ref = raiz ? regimePorRaiz.get(raiz) : undefined;
    const key = ref ? ref.codigo : REGIME_NAO_MAPEADO;
    const acc = getAcc(key);
    acc.receitaIndividual += it.valorProdutos;
    if (!it.intragrupo) acc.receitaExterna += it.valorProdutos;
    if (it.documentoId !== null) acc.notas.add(it.documentoId);
    const emp = acc.empresas.get(it.empresaId) ?? {
      empresaId: it.empresaId,
      empresaNome: it.empresaNome,
      receitaIndividual: 0,
    };
    emp.receitaIndividual += it.valorProdutos;
    if (it.empresaNome) emp.empresaNome = it.empresaNome;
    acc.empresas.set(it.empresaId, emp);
  }

  let totalReceitaIndividual = 0;
  let totalReceitaExterna = 0;
  let receitaNaoMapeada = 0;
  const regimes: RegimeLinha[] = [];
  for (const [codigo, acc] of porRegime) {
    totalReceitaIndividual += acc.receitaIndividual;
    totalReceitaExterna += acc.receitaExterna;
    if (codigo === REGIME_NAO_MAPEADO) receitaNaoMapeada += acc.receitaIndividual;
    regimes.push({
      regimeCodigo: codigo,
      regimeLabel: codigo === REGIME_NAO_MAPEADO ? "Regime não mapeado" : regimeLabel(codigo),
      receitaIndividual: acc.receitaIndividual,
      receitaExterna: acc.receitaExterna,
      qtdEmpresas: acc.empresas.size,
      qtdNotas: acc.notas.size,
      empresas: [...acc.empresas.values()].sort(
        (a, b) => b.receitaIndividual - a.receitaIndividual,
      ),
    });
  }
  // Mapeados primeiro (por receita externa desc); nao_mapeado por ultimo.
  regimes.sort((a, b) => {
    const an = a.regimeCodigo === REGIME_NAO_MAPEADO ? 1 : 0;
    const bn = b.regimeCodigo === REGIME_NAO_MAPEADO ? 1 : 0;
    return an - bn || b.receitaExterna - a.receitaExterna;
  });

  const coberturaPercentual =
    totalReceitaIndividual > 0
      ? (totalReceitaIndividual - receitaNaoMapeada) / totalReceitaIndividual
      : 1;

  return {
    regimes,
    totalReceitaIndividual,
    totalReceitaExterna,
    receitaNaoMapeada,
    coberturaPercentual,
    regimeSnapshotAtual: true,
  };
}

export async function faturamentoPorRegime(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoPorRegimeResultado> {
  const { itens } = await carregarItensVendaComGrupo(prisma, input);
  const depara = await prisma.dimEmpresaRegime.findMany({
    select: { cnpjRaiz: true, regimeCodigo: true, regimeLabel: true },
  });
  const regimePorRaiz = new Map<string, RegimeRef>(
    depara.map((d) => [d.cnpjRaiz, { codigo: d.regimeCodigo, label: d.regimeLabel }]),
  );
  return agregarPorRegime(itens, regimePorRaiz);
}
