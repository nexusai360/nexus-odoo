"use server";

import { prisma } from "@/lib/prisma";
import { guardDominio } from "@/lib/reports/guard";
import { reportFreshness } from "@/lib/reports/freshness";
import { getReport } from "@/lib/reports/catalog";
import type { ReportEntry, ReportFilterValues, ReportResult, ReportState } from "@/lib/reports/types";
import {
  querySaldoProduto,
  queryValorArmazem,
  queryEntradasSaidas,
  queryProdutosParados,
  queryTopMovimentados,
  queryConcentracao,
  type SaldoProdutoData,
  type ValorArmazemData,
  type EntradasSaidasData,
  type ProdutoParadoData,
  type TopMovimentadoData,
  type ConcentracaoData,
  type ConcentracaoFamiliaRow,
  type ConcentracaoMarcaRow,
} from "@/lib/reports/queries/estoque";

// Reexporta todos os tipos públicos do núcleo de estoque
export type {
  DetalhePorLocal,
  SaldoProdutoRow,
  SaldoProdutoKpis,
  SaldoProdutoData,
  ValorArmazemRow,
  ValorArmazemKpis,
  ValorArmazemData,
  MovimentoMes,
  DetalheMovimento,
  EntradasSaidasData,
  ProdutoParadoRow,
  ProdutoParadoKpis,
  ProdutoParadoData,
  TopMovimentadoBar,
  TopMovimentadoKpis,
  TopMovimentadoData,
  ConcentracaoFamiliaRow,
  ConcentracaoMarcaRow,
  ConcentracaoData,
} from "@/lib/reports/queries/estoque";

/**
 * Resolve o estado do fato: 'preparando' se o builder nunca rodou;
 * caso contrário 'ok'. 'vazio'/'erro' são decididos pela função-chamadora.
 */
async function estadoDoFato(fato: string): Promise<"preparando" | "ok"> {
  const build = await prisma.fatoBuildState.findUnique({ where: { fato } });
  return build ? "ok" : "preparando";
}

/**
 * Resolve a entrada de catálogo de um relatório; lança erro explícito se o
 * id não existir. Usado por todas as queries , CR-03.
 */
function requireReport(id: string): ReportEntry {
  const entry = getReport(id);
  if (!entry) throw new Error(`Relatório desconhecido: ${id}`);
  return entry;
}

const TOP_N = 10;
const TOP_CONCENTRACAO = 12;

/**
 * Ordena por valor desc, mantém os TOP_CONCENTRACAO maiores e agrupa o
 * restante numa entrada "Outras".
 */
function agruparTopN(
  itens: { rotulo: string; valor: number }[],
): { rotulo: string; valor: number }[] {
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
  if (ordenados.length <= TOP_CONCENTRACAO) return ordenados;
  const top = ordenados.slice(0, TOP_CONCENTRACAO);
  const resto = ordenados.slice(TOP_CONCENTRACAO);
  const somaResto = resto.reduce((acc, r) => acc + r.valor, 0);
  if (somaResto > 0) {
    top.push({ rotulo: "Outras", valor: somaResto });
  }
  return top;
}

/** R1 , Saldo por produto (wrapper). */
export async function getRelatorioSaldoProduto(
  filtros: ReportFilterValues,
): Promise<ReportResult<SaldoProdutoData>> {
  const vazio: SaldoProdutoData = {
    kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
    linhas: [],
  };
  try {
    const entry = requireReport("saldo-produto");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const dados = await querySaldoProduto(prisma, {
      armazemId: filtros.armazemId,
      familiaId: filtros.familiaId,
    });
    const estado: ReportState = dados.linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R2 , Valor de estoque por armazém (wrapper). */
export async function getRelatorioValorPorArmazem(
  _filtros: ReportFilterValues,
): Promise<ReportResult<ValorArmazemData>> {
  const vazio: ValorArmazemData = {
    kpis: { valorTotal: 0, numArmazens: 0 },
    linhas: [],
    top8: [],
  };
  try {
    const entry = requireReport("valor-armazem");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const { kpis, linhasBruto } = await queryValorArmazem(prisma);
    const linhas = linhasBruto.map((l) => ({
      armazem: l.armazem,
      valor: l.valor,
      numProdutos: l.numProdutos,
      percentual: kpis.valorTotal > 0 ? (l.valor / kpis.valorTotal) * 100 : 0,
    }));
    const top8 = linhasBruto.slice(0, 8).map((l) => ({ rotulo: l.armazem, valor: l.valor }));
    const dados: ValorArmazemData = { kpis, linhas, top8 };
    const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R3 , Entradas vs. saídas por mês (wrapper). */
export async function getRelatorioEntradasSaidas(
  filtros: ReportFilterValues,
): Promise<ReportResult<EntradasSaidasData>> {
  const vazio: EntradasSaidasData = { serie: [], detalhe: [] };
  try {
    const entry = requireReport("entradas-saidas");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_movimento");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const dados = await queryEntradasSaidas(prisma, {
      periodoDe: filtros.periodoDe,
      periodoAte: filtros.periodoAte,
      armazemId: filtros.armazemId,
    });
    const estado: ReportState = dados.serie.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R4 , Produtos parados (wrapper). */
export async function getRelatorioProdutoParado(
  filtros: ReportFilterValues,
): Promise<ReportResult<ProdutoParadoData>> {
  const vazio: ProdutoParadoData = {
    kpis: { totalParados: 0, valorImobilizado: 0 },
    total: 0,
    linhas: [],
  };
  try {
    const entry = requireReport("produtos-parados");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_produto_parado");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const dados = await queryProdutosParados(prisma, {
      faixaDias: filtros.faixaDias,
      armazemId: filtros.armazemId,
    });
    const estado: ReportState = dados.linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R5 , Top produtos movimentados (wrapper). */
export async function getRelatorioTopMovimentados(
  filtros: ReportFilterValues,
): Promise<ReportResult<TopMovimentadoData>> {
  const vazio: TopMovimentadoData = {
    kpis: { totalProdutos: 0, totalUnidades: 0 },
    barras: [],
    linhas: [],
  };
  try {
    const entry = requireReport("top-movimentados");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_movimento");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const { kpis, linhas } = await queryTopMovimentados(prisma, {
      periodoDe: filtros.periodoDe,
      periodoAte: filtros.periodoAte,
      sentido: filtros.sentido,
    });
    const barras = linhas.slice(0, TOP_N);
    const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados: { kpis, barras, linhas }, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R6 , Concentração do estoque por família e por marca (wrapper). */
export async function getRelatorioConcentracao(
  _filtros: ReportFilterValues,
): Promise<ReportResult<ConcentracaoData>> {
  const vazio: ConcentracaoData = {
    familia: [],
    tabelaFamilia: [],
    marca: [],
    tabelaMarca: [],
  };
  try {
    const entry = requireReport("concentracao");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const { familiasBruto, marcasBruto } = await queryConcentracao(prisma);
    const totalFamilia = familiasBruto.reduce((acc, r) => acc + r.valor, 0);
    const totalMarca = marcasBruto.reduce((acc, r) => acc + r.valor, 0);
    const tabelaFamilia: ConcentracaoFamiliaRow[] = familiasBruto.map((r) => ({
      familia: r.rotulo,
      valor: r.valor,
      percentual: totalFamilia > 0 ? (r.valor / totalFamilia) * 100 : 0,
    }));
    const tabelaMarca: ConcentracaoMarcaRow[] = marcasBruto.map((r) => ({
      marca: r.rotulo,
      valor: r.valor,
      percentual: totalMarca > 0 ? (r.valor / totalMarca) * 100 : 0,
    }));
    const dados: ConcentracaoData = {
      familia: agruparTopN(familiasBruto),
      tabelaFamilia,
      marca: agruparTopN(marcasBruto),
      tabelaMarca,
    };
    const estado: ReportState =
      dados.familia.length === 0 && dados.marca.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}
