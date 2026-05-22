// src/lib/reports/queries/estoque.ts
//
// Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`,
// sem shaping de gráfico**. **Não captura exceção** (deixa propagar — quem
// trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper
// `report-data.ts`, não aqui.
//
// O módulo **importa** `limparNomeLocal` de `@/lib/reports/local-nome` e a usa
// nas agregações que precisam de rótulo de local — `limparNomeLocal` permanece
// em seu módulo atual, não é movida. O que **não vai** para o núcleo:
// `agruparTopN` (report-data.ts, função local) e as constantes `TOP_N`/
// `TOP_CONCENTRACAO` — são shaping de gráfico e permanecem no wrapper.

import type { PrismaClient } from "@/generated/prisma/client";
import { limparNomeLocal } from "@/lib/reports/local-nome";

// ---------------------------------------------------------------------------
// Tipos de R1 — Saldo por produto
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// R1 — querySaldoProduto
// ---------------------------------------------------------------------------

/**
 * Agrega saldo de estoque por produto.
 * Fato: fato_estoque_saldo.
 * Não captura exceção — deixa propagar para o wrapper.
 */
export async function querySaldoProduto(
  prisma: PrismaClient,
  filtros: { armazemId?: number; familiaId?: number; termo?: string },
): Promise<SaldoProdutoData> {
  // groupBy não suporta _count(distinct), então buscamos os dados brutos e
  // agregamos em JS — dataset cabe confortavelmente em memória.
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
      ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
      ...(filtros.termo
        ? { produtoNome: { contains: filtros.termo, mode: "insensitive" as const } }
        : {}),
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

  return {
    kpis: { totalProdutos, produtosNegativos, valorTotal },
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R2 — Valor por armazém
// ---------------------------------------------------------------------------

/** Linha da tabela de R2 (sem percentual — calculado no wrapper/tool). */
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

// ---------------------------------------------------------------------------
// R2 — queryValorArmazem
// ---------------------------------------------------------------------------

/**
 * Agrega valor de estoque por armazém. Devolve linhasBruto (sem percentual —
 * percentual é shaping e calculado no wrapper F3 e na tool MCP, regra N8).
 * Fato: fato_estoque_saldo.
 */
export async function queryValorArmazem(
  prisma: PrismaClient,
): Promise<{ kpis: { valorTotal: number; numArmazens: number }; linhasBruto: { armazem: string; valor: number; numProdutos: number }[] }> {
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: { vrSaldo: { gt: 0 } },
    select: { localNome: true, produtoId: true, vrSaldo: true },
  });

  const mapa = new Map<string, { valor: number; produtos: Set<number | null> }>();
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

  return {
    kpis: { valorTotal, numArmazens: mapa.size },
    linhasBruto,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R3 — Entradas e saídas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// R3 — queryEntradasSaidas
// ---------------------------------------------------------------------------

/**
 * Agrega entradas e saídas por mês. Fato: fato_estoque_movimento.
 */
export async function queryEntradasSaidas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; armazemId?: number },
): Promise<EntradasSaidasData> {
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

  return { serie, detalhe };
}

// ---------------------------------------------------------------------------
// Tipos de R4 — Produtos parados
// ---------------------------------------------------------------------------

/** Linha de R4. */
export interface ProdutoParadoRow {
  [k: string]: unknown;
  produtoNome: string | null;
  localNome: string | null;
  saldo: number;
  dias: number;
  vrSaldo: number;
}
/** KPIs de topo de R4. */
export interface ProdutoParadoKpis {
  totalParados: number;
  valorImobilizado: number;
}
/** Dados de R4: KPIs + tabela. */
export interface ProdutoParadoData {
  kpis: ProdutoParadoKpis;
  total: number;
  linhas: ProdutoParadoRow[];
}

// ---------------------------------------------------------------------------
// R4 — queryProdutosParados
// ---------------------------------------------------------------------------

/**
 * Lista produtos parados com filtros de faixa de dias e armazém.
 * Fato: fato_produto_parado.
 */
export async function queryProdutosParados(
  prisma: PrismaClient,
  filtros: { faixaDias?: number; armazemId?: number },
): Promise<ProdutoParadoData> {
  const rows = await prisma.fatoProdutoParado.findMany({
    where: {
      saldo: { gt: 0 },
      ...(filtros.faixaDias ? { dias: { gte: filtros.faixaDias } } : {}),
      ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
    },
    select: {
      produtoNome: true,
      localNome: true,
      saldo: true,
      dias: true,
      vrSaldo: true,
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
  const valorImobilizado = linhas.reduce((acc, l) => acc + l.vrSaldo, 0);
  return {
    kpis: { totalParados: linhas.length, valorImobilizado },
    total: linhas.length,
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R5 — Top movimentados
// ---------------------------------------------------------------------------

/** Barra de R5. */
export interface TopMovimentadoBar {
  [k: string]: unknown;
  rotulo: string;
  valor: number;
}
/** KPIs de topo de R5. */
export interface TopMovimentadoKpis {
  totalProdutos: number;
  totalUnidades: number;
}
/** Dados de R5: KPIs + linhas (lista completa — slice para barras feito no wrapper). */
export interface TopMovimentadoData {
  kpis: TopMovimentadoKpis;
  barras: TopMovimentadoBar[];
  linhas: TopMovimentadoBar[];
}

// ---------------------------------------------------------------------------
// R5 — queryTopMovimentados
// ---------------------------------------------------------------------------

/**
 * Agrega movimentações por produto. Devolve a lista completa (sem slice para top-N
 * — o wrapper F3 e a tool MCP fazem o slice independentemente).
 * Fato: fato_estoque_movimento.
 */
export async function queryTopMovimentados(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; sentido?: string },
): Promise<{ kpis: { totalProdutos: number; totalUnidades: number }; linhas: { rotulo: string; valor: number }[] }> {
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
  const linhas = grupos
    .map((g) => ({
      rotulo: g.produtoNome ?? "Sem produto",
      valor: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  const totalUnidades = linhas.reduce((acc, l) => acc + l.valor, 0);

  return {
    kpis: { totalProdutos: linhas.length, totalUnidades },
    linhas,
  };
}

// ---------------------------------------------------------------------------
// Tipos de R6 — Concentração
// ---------------------------------------------------------------------------

/** Linha da tabela de famílias de R6. */
export interface ConcentracaoFamiliaRow {
  [k: string]: unknown;
  familia: string;
  valor: number;
  percentual: number;
}

/** Linha da tabela de marcas de R6. */
export interface ConcentracaoMarcaRow {
  [k: string]: unknown;
  marca: string;
  valor: number;
  percentual: number;
}

/** Dados de R6: distribuição por família e por marca. */
export interface ConcentracaoData {
  /** Fatia para o PieChart (família). */
  familia: { rotulo: string; valor: number }[];
  /** Tabela de família com percentual. */
  tabelaFamilia: ConcentracaoFamiliaRow[];
  /** Fatia para o BarChart (marca). */
  marca: { rotulo: string; valor: number }[];
  /** Tabela de marca com percentual. */
  tabelaMarca: ConcentracaoMarcaRow[];
}

// ---------------------------------------------------------------------------
// R6 — queryConcentracao
// ---------------------------------------------------------------------------

/**
 * Agrega vrSaldo por família e marca. Devolve dados brutos (sem percentual —
 * percentual é shaping calculado no wrapper F3 e na tool MCP, regra N8).
 * Sem agruparTopN — shaping de gráfico fica no wrapper.
 * Fato: fato_estoque_saldo.
 */
export async function queryConcentracao(
  prisma: PrismaClient,
): Promise<{ familiasBruto: { rotulo: string; valor: number }[]; marcasBruto: { rotulo: string; valor: number }[] }> {
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

  const familiasBruto = porFamilia
    .map((g) => ({
      rotulo: g.familiaNome ?? "Não classificado",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  const marcasBruto = porMarca
    .map((g) => ({
      rotulo: g.marcaNome ?? "Não classificado",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  return { familiasBruto, marcasBruto };
}
