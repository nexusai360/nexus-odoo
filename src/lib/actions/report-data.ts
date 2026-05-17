"use server";

import { prisma } from "@/lib/prisma";
import { guardDominio } from "@/lib/reports/guard";
import { reportFreshness } from "@/lib/reports/freshness";
import { getReport } from "@/lib/reports/catalog";
import type { ReportEntry, ReportFilterValues, ReportResult, ReportState } from "@/lib/reports/types";

/** Linha de R1. */
export interface SaldoProdutoRow {
  produtoNome: string | null;
  localNome: string | null;
  familiaNome: string | null;
  quantidade: number | null;
  unidade: string | null;
}
/** Barra de R2. */
export interface ValorArmazemBar {
  rotulo: string;
  valor: number;
}

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
 * id não existir (em vez de `getReport(id)!` quebrar silenciosamente
 * adiante). Usado por todas as queries — CR-03.
 */
function requireReport(id: string): ReportEntry {
  const entry = getReport(id);
  if (!entry) throw new Error(`Relatório desconhecido: ${id}`);
  return entry;
}

/** R1 — Saldo por produto e armazém. */
export async function getRelatorioSaldoProduto(
  filtros: ReportFilterValues,
): Promise<ReportResult<SaldoProdutoRow[]>> {
  try {
    const entry = requireReport("saldo-produto");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const rows = await prisma.fatoEstoqueSaldo.findMany({
      where: {
        ...(filtros.produtoId ? { produtoId: filtros.produtoId } : {}),
        ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
        ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
        ...(filtros.busca
          ? { produtoNome: { contains: filtros.busca, mode: "insensitive" } }
          : {}),
      },
      select: {
        produtoNome: true, localNome: true, familiaNome: true,
        quantidade: true, unidade: true,
      },
      orderBy: { produtoNome: "asc" },
    });
    const dados: SaldoProdutoRow[] = rows.map((r) => ({
      produtoNome: r.produtoNome,
      localNome: r.localNome,
      familiaNome: r.familiaNome,
      quantidade: r.quantidade ? Number(r.quantidade) : null,
      unidade: r.unidade,
    }));
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}

/** Ponto da série de R3. */
export interface MovimentoMes {
  mes: string;
  entrada: number;
  saida: number;
}
/** Linha de R4. */
export interface ProdutoParadoRow {
  produtoNome: string | null;
  localNome: string | null;
  saldo: number;
  dias: number;
  vrSaldo: number;
}
/** Dados de R4: KPI + tabela. */
export interface ProdutoParadoData {
  total: number;
  linhas: ProdutoParadoRow[];
}
/** Barra de R5. */
export interface TopMovimentadoBar {
  rotulo: string;
  valor: number;
}
/** Dados de R6: distribuição por família e por marca. */
export interface ConcentracaoData {
  familia: { rotulo: string; valor: number }[];
  marca: { rotulo: string; valor: number }[];
}

const TOP_N = 10;

/** R2 — Valor de estoque por armazém. */
export async function getRelatorioValorPorArmazem(
  _filtros: ReportFilterValues,
): Promise<ReportResult<ValorArmazemBar[]>> {
  try {
    const entry = requireReport("valor-armazem");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const grupos = await prisma.fatoEstoqueSaldo.groupBy({
      by: ["localNome"],
      where: { vrSaldo: { gt: 0 } },
      _sum: { vrSaldo: true },
    });
    const dados: ValorArmazemBar[] = grupos.map((g) => ({
      rotulo: g.localNome ?? "Sem armazém",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }));
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}

/** R3 — Entradas vs. saídas por mês. */
export async function getRelatorioEntradasSaidas(
  filtros: ReportFilterValues,
): Promise<ReportResult<MovimentoMes[]>> {
  try {
    const entry = requireReport("entradas-saidas");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_movimento");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const grupos = await prisma.fatoEstoqueMovimento.groupBy({
      by: ["mes", "sentido"],
      where: {
        ...(filtros.periodoDe && filtros.periodoAte
          ? { mes: { gte: filtros.periodoDe, lte: filtros.periodoAte } }
          : {}),
        ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
      },
      _sum: { quantidade: true },
    });
    const porMes = new Map<string, MovimentoMes>();
    for (const g of grupos) {
      const item = porMes.get(g.mes) ?? { mes: g.mes, entrada: 0, saida: 0 };
      const valor = g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0;
      if (g.sentido === "entrada") item.entrada = valor;
      else item.saida = valor;
      porMes.set(g.mes, item);
    }
    const dados = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}

/** R4 — Produtos parados. */
export async function getRelatorioProdutoParado(
  filtros: ReportFilterValues,
): Promise<ReportResult<ProdutoParadoData>> {
  const vazio: ProdutoParadoData = { total: 0, linhas: [] };
  try {
    const entry = requireReport("produtos-parados");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_produto_parado");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const rows = await prisma.fatoProdutoParado.findMany({
      where: {
        saldo: { gt: 0 },
        ...(filtros.faixaDias ? { dias: { gte: filtros.faixaDias } } : {}),
        ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
      },
      select: {
        produtoNome: true, localNome: true, saldo: true,
        dias: true, vrSaldo: true,
      },
      orderBy: { dias: "desc" },
    });
    const linhas: ProdutoParadoRow[] = rows.map((r) => ({
      produtoNome: r.produtoNome,
      localNome: r.localNome,
      saldo: Number(r.saldo),
      dias: r.dias,
      vrSaldo: Number(r.vrSaldo),
    }));
    const dados: ProdutoParadoData = { total: linhas.length, linhas };
    const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R5 — Top produtos movimentados. */
export async function getRelatorioTopMovimentados(
  filtros: ReportFilterValues,
): Promise<ReportResult<TopMovimentadoBar[]>> {
  try {
    const entry = requireReport("top-movimentados");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_movimento");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const grupos = await prisma.fatoEstoqueMovimento.groupBy({
      by: ["produtoNome"],
      where: {
        ...(filtros.periodoDe && filtros.periodoAte
          ? { mes: { gte: filtros.periodoDe, lte: filtros.periodoAte } }
          : {}),
        ...(filtros.sentido ? { sentido: filtros.sentido } : {}),
      },
      _sum: { quantidade: true },
    });
    const dados: TopMovimentadoBar[] = grupos
      .map((g) => ({
        rotulo: g.produtoNome ?? "Sem produto",
        valor: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, TOP_N);
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}

/** R6 — Concentração do estoque por família e por marca. */
export async function getRelatorioConcentracao(
  _filtros: ReportFilterValues,
): Promise<ReportResult<ConcentracaoData>> {
  const vazio: ConcentracaoData = { familia: [], marca: [] };
  try {
    const entry = requireReport("concentracao");
    await guardDominio(entry.dominio);
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: vazio, freshness };
    }
    const porFamilia = await prisma.fatoEstoqueSaldo.groupBy({
      by: ["familiaNome"],
      where: { vrSaldo: { gt: 0 } },
      _sum: { vrSaldo: true },
    });
    const porMarca = await prisma.fatoEstoqueSaldo.groupBy({
      by: ["marcaNome"],
      where: { vrSaldo: { gt: 0 } },
      _sum: { vrSaldo: true },
    });
    const dados: ConcentracaoData = {
      familia: porFamilia.map((g) => ({
        rotulo: g.familiaNome ?? "Não classificado",
        valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
      })),
      marca: porMarca.map((g) => ({
        rotulo: g.marcaNome ?? "Não classificado",
        valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
      })),
    };
    const estado: ReportState =
      dados.familia.length === 0 && dados.marca.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}
