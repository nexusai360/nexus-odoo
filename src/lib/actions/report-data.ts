"use server";

import { prisma } from "@/lib/prisma";
import { guardDominio } from "@/lib/reports/guard";
import { reportFreshness } from "@/lib/reports/freshness";
import { getReport } from "@/lib/reports/catalog";
import { limparNomeLocal } from "@/lib/reports/local-nome";
import type { ReportEntry, ReportFilterValues, ReportResult, ReportState } from "@/lib/reports/types";

/** Item do detalhamento por local de um produto (para o drill-down). */
export interface DetalhePorLocal {
  localRotulo: string;
  saldo: number;
  valor: number;
}

/** Linha agregada de R1 (por produto). */
export interface SaldoProdutoRow {
  produtoNome: string;
  familiaNome: string | null;
  marcaNome: string | null;
  saldoTotal: number;
  valorTotal: number;
  numLocais: number;
  /** Saldo do produto quebrado por local, com rótulo limpo. */
  detalhePorLocal: DetalhePorLocal[];
}

/** KPIs de topo de R1. */
export interface SaldoProdutoKpis {
  totalProdutos: number;
  produtosNegativos: number;
  valorTotal: number;
}

/** Retorno completo de R1. */
export interface SaldoProdutoData {
  kpis: SaldoProdutoKpis;
  linhas: SaldoProdutoRow[];
}
/** Linha da tabela de R2. */
export interface ValorArmazemRow {
  [k: string]: unknown;
  armazem: string;
  valor: number;
  numProdutos: number;
  percentual: number;
}

/** KPIs de R2. */
export interface ValorArmazemKpis {
  valorTotal: number;
  numArmazens: number;
}

/** Retorno completo de R2. */
export interface ValorArmazemData {
  kpis: ValorArmazemKpis;
  linhas: ValorArmazemRow[];
  /** Top-8 para o BarChart auxiliar. */
  top8: { rotulo: string; valor: number }[];
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

/** R1 — Saldo por produto (agregado). */
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

    // groupBy não suporta _count(distinct), então buscamos os dados
    // brutos e agregamos em JS — dataset cabe confortavelmente em memória.
    const rows = await prisma.fatoEstoqueSaldo.findMany({
      where: {
        ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
        ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
      },
      select: {
        produtoId: true,
        produtoNome: true,
        familiaNome: true,
        marcaNome: true,
        localId: true,
        localNome: true,
        quantidade: true,
        vrSaldo: true,
      },
    });

    // Agrega por produtoId
    const mapa = new Map<
      number,
      {
        produtoNome: string;
        familiaNome: string | null;
        marcaNome: string | null;
        saldoTotal: number;
        valorTotal: number;
        locais: Set<number>;
        detalheMap: Map<string, { saldo: number; valor: number }>;
      }
    >();

    for (const r of rows) {
      // Ignora linhas sem produtoId (dados incompletos do Odoo)
      if (r.produtoId == null) continue;
      const pid = r.produtoId;
      const qty = r.quantidade ? Number(r.quantidade) : 0;
      const vr = r.vrSaldo ? Number(r.vrSaldo) : 0;
      const rotulo = r.localNome
        ? limparNomeLocal(r.localNome).rotulo
        : "Sem local";

      const existing = mapa.get(pid);
      if (existing) {
        existing.saldoTotal += qty;
        existing.valorTotal += vr;
        if (r.localId != null) existing.locais.add(r.localId);
        const prev = existing.detalheMap.get(rotulo) ?? { saldo: 0, valor: 0 };
        existing.detalheMap.set(rotulo, {
          saldo: prev.saldo + qty,
          valor: prev.valor + vr,
        });
      } else {
        const detalheMap = new Map<string, { saldo: number; valor: number }>();
        detalheMap.set(rotulo, { saldo: qty, valor: vr });
        mapa.set(pid, {
          produtoNome: r.produtoNome ?? "",
          familiaNome: r.familiaNome,
          marcaNome: r.marcaNome,
          saldoTotal: qty,
          valorTotal: vr,
          locais: r.localId != null ? new Set([r.localId]) : new Set(),
          detalheMap,
        });
      }
    }

    const linhas: SaldoProdutoRow[] = [...mapa.values()]
      .map((v) => ({
        produtoNome: v.produtoNome,
        familiaNome: v.familiaNome,
        marcaNome: v.marcaNome,
        saldoTotal: v.saldoTotal,
        valorTotal: v.valorTotal,
        numLocais: v.locais.size,
        detalhePorLocal: [...v.detalheMap.entries()]
          .map(([localRotulo, d]) => ({
            localRotulo,
            saldo: d.saldo,
            valor: d.valor,
          }))
          .sort((a, b) => b.valor - a.valor),
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const totalProdutos = linhas.length;
    const produtosNegativos = linhas.filter((l) => l.saldoTotal < 0).length;
    const valorTotal = linhas.reduce((acc, l) => acc + l.valorTotal, 0);

    const dados: SaldoProdutoData = {
      kpis: { totalProdutos, produtosNegativos, valorTotal },
      linhas,
    };
    const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** Ponto da série de R3. */
export interface MovimentoMes {
  mes: string;
  entrada: number;
  saida: number;
}

/** Linha do detalhamento de R3 (por mês × sentido × produto). */
export interface DetalheMovimento {
  [k: string]: unknown;
  mes: string;
  sentido: string;
  produto: string;
  quantidade: number;
}

/** Retorno completo de R3: série do gráfico + tabela de detalhe. */
export interface EntradasSaidasData {
  serie: MovimentoMes[];
  detalhe: DetalheMovimento[];
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
const TOP_CONCENTRACAO = 12;

/** R2 — Valor de estoque por armazém. */
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

    // Agrega por localNome: valor total e número de produtos distintos.
    const rows = await prisma.fatoEstoqueSaldo.findMany({
      where: { vrSaldo: { gt: 0 } },
      select: { localNome: true, produtoId: true, vrSaldo: true },
    });

    const mapa = new Map<
      string,
      { valor: number; produtos: Set<number | null> }
    >();
    for (const r of rows) {
      const nomeRaw = r.localNome ?? "Sem armazém";
      const rotulo = limparNomeLocal(nomeRaw).rotulo;
      const vr = r.vrSaldo ? Number(r.vrSaldo) : 0;
      const existing = mapa.get(rotulo);
      if (existing) {
        existing.valor += vr;
        existing.produtos.add(r.produtoId);
      } else {
        mapa.set(rotulo, { valor: vr, produtos: new Set([r.produtoId]) });
      }
    }

    const valorTotal = [...mapa.values()].reduce((acc, v) => acc + v.valor, 0);

    const linhasBruto = [...mapa.entries()]
      .map(([armazem, v]) => ({ armazem, valor: v.valor, numProdutos: v.produtos.size }))
      .sort((a, b) => b.valor - a.valor);

    const linhas: ValorArmazemRow[] = linhasBruto.map((l) => ({
      armazem: l.armazem,
      valor: l.valor,
      numProdutos: l.numProdutos,
      percentual: valorTotal > 0 ? (l.valor / valorTotal) * 100 : 0,
    }));

    const top8 = linhasBruto.slice(0, 8).map((l) => ({
      rotulo: l.armazem,
      valor: l.valor,
    }));

    const dados: ValorArmazemData = {
      kpis: { valorTotal, numArmazens: mapa.size },
      linhas,
      top8,
    };
    const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}

/** R3 — Entradas vs. saídas por mês. */
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

    const where = {
      ...(filtros.periodoDe && filtros.periodoAte
        ? { mes: { gte: filtros.periodoDe, lte: filtros.periodoAte } }
        : {}),
      ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
    };

    // Série agregada por mês × sentido (para o LineChart).
    const grupos = await prisma.fatoEstoqueMovimento.groupBy({
      by: ["mes", "sentido"],
      where,
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
    const serie = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));

    // Detalhe por mês × sentido × produto (para a DataTable).
    const detGrupos = await prisma.fatoEstoqueMovimento.groupBy({
      by: ["mes", "sentido", "produtoNome"],
      where,
      _sum: { quantidade: true },
      orderBy: [{ mes: "asc" }, { sentido: "asc" }],
    });
    const detalhe: DetalheMovimento[] = detGrupos.map((g) => ({
      mes: g.mes,
      sentido: g.sentido,
      produto: g.produtoNome ?? "Sem produto",
      quantidade: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
    }));

    const dados: EntradasSaidasData = { serie, detalhe };
    const estado: ReportState = serie.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
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

/**
 * Ordena por valor desc, mantém os TOP_CONCENTRACAO maiores e agrupa o
 * restante numa entrada "Outras" (ou "Outras marcas"/"Outras famílias").
 * Garante que o gráfico não exiba barras ínfimas ou escala distorcida.
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
      familia: agruparTopN(
        porFamilia.map((g) => ({
          rotulo: g.familiaNome ?? "Não classificado",
          valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
        })),
      ),
      marca: agruparTopN(
        porMarca.map((g) => ({
          rotulo: g.marcaNome ?? "Não classificado",
          valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
        })),
      ),
    };
    const estado: ReportState =
      dados.familia.length === 0 && dados.marca.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: vazio, freshness: null };
  }
}
