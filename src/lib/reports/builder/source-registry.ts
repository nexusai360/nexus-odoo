// src/lib/reports/builder/source-registry.ts
// Registry de fontes do construtor: mapeia (fato, shapeDerivado) -> produtor.
// O produtor roda a query auditada certa e monta o RawSourceData padronizado.
// Onda 1: apenas estoque (queries comprovadas). Freshness ligado em B2.
import { prisma } from "@/lib/prisma";
import {
  querySaldoProduto,
  queryConcentracao,
  queryValorArmazem,
  queryEntradasSaidas,
  queryProdutosParados,
  queryTopMovimentados,
} from "@/lib/reports/queries/estoque";
import {
  querySaldoContas,
  queryCaixaPeriodo,
  queryFluxoCaixa,
} from "@/lib/reports/queries/financeiro";
import { queryResultadoPorConta } from "@/lib/reports/queries/financeiro-resultado";
import {
  queryPedidosPeriodo,
  queryPedidosPorEtapa,
  queryPedidosPorVendedor,
  queryPedidosAtrasados,
} from "@/lib/reports/queries/comercial";
import {
  queryFaturamentoPeriodo,
  queryFaturamentoPorCliente,
  queryProdutosFaturados,
} from "@/lib/reports/queries/fiscal";
import { queryContarParceiros, queryParceirosPorUf } from "@/lib/reports/queries/cadastros";
import type {
  RawSourceData,
  ShapeDerivado,
  SourceContract,
} from "./types";

export type FiltrosFonte = {
  armazemId?: number;
  familiaId?: number;
  termo?: string;
  /** Dias minimos parado (fato_estoque_parados). */
  faixaDias?: number;
  /** Sentido do movimento: "entrada" | "saida" (fato_estoque_top_movimentados). */
  sentido?: string;
  /** Nome (ou parte) da marca para recortar um KPI por marca (ex.: "Matrix"). */
  marca?: string;
  /** Janela temporal (mes "YYYY-MM") , so afeta fatos com serie temporal (movimento). */
  periodoDe?: string;
  periodoAte?: string;
};

type Produtor = (filtros: FiltrosFonte) => Promise<RawSourceData>;

interface FonteDef {
  contract: SourceContract;
  produtores: Partial<Record<ShapeDerivado, Produtor>>;
}

const fatoEstoqueSaldo: FonteDef = {
  contract: {
    fato: "fato_estoque_saldo",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["tabela", "kpis", "agregacaoCategorica"],
    campos: {
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "familiaNome", label: "Familia", tipo: "texto" },
        { key: "marcaNome", label: "Marca", tipo: "texto" },
        { key: "saldoTotal", label: "Saldo", tipo: "numero" },
        { key: "valorTotal", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "totalProdutos", label: "Produtos", tipo: "numero" },
        { key: "produtosNegativos", label: "Negativos", tipo: "numero" },
        { key: "valorTotal", label: "Valor total", tipo: "moeda" },
      ],
      agregacaoCategorica: [
        { key: "rotulo", label: "Categoria", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    tabela: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return {
        linhas: d.linhas as unknown as Record<string, unknown>[],
        kpis: { ...d.kpis },
        freshness: null,
      };
    },
    kpis: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return { linhas: [], kpis: { ...d.kpis }, freshness: null };
    },
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return {
        linhas: d.familiasBruto as unknown as Record<string, unknown>[],
        freshness: null,
      };
    },
  },
};

// --- Dimensao ARMAZEM: valor/produtos por armazem (queryValorArmazem). ---
const fatoEstoqueArmazem: FonteDef = {
  contract: {
    fato: "fato_estoque_armazem",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Armazem", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "valorTotal", label: "Valor total", tipo: "moeda" },
        { key: "numArmazens", label: "Armazens", tipo: "numero" },
      ],
      tabela: [
        { key: "armazem", label: "Armazem", tipo: "texto" },
        { key: "numProdutos", label: "Produtos", tipo: "numero" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: d.linhasBruto.map((l) => ({ rotulo: l.armazem, valor: l.valor })), freshness: null };
    },
    kpis: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: [], kpis: { valorTotal: d.kpis.valorTotal, numArmazens: d.kpis.numArmazens }, freshness: null };
    },
    tabela: async () => {
      const d = await queryValorArmazem(prisma);
      return { linhas: d.linhasBruto as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- ONDE cada produto esta: produto x armazem (querySaldoProduto.detalhePorLocal). ---
const fatoEstoqueLocalProduto: FonteDef = {
  contract: {
    fato: "fato_estoque_local_produto",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["tabela"],
    campos: {
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "armazem", label: "Armazem", tipo: "texto" },
        { key: "saldo", label: "Saldo", tipo: "numero" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    tabela: async (filtros) => {
      const d = await querySaldoProduto(prisma, { armazemId: filtros.armazemId, familiaId: filtros.familiaId });
      const linhas: Record<string, unknown>[] = [];
      for (const p of d.linhas) {
        for (const loc of p.detalhePorLocal) {
          linhas.push({ produtoNome: p.produtoNome, armazem: loc.localRotulo, saldo: loc.saldo, valor: loc.valor });
        }
      }
      return { linhas, freshness: null };
    },
  },
};

// --- Dimensao MARCA: valor por marca (queryConcentracao.marcasBruto). ---
const fatoEstoqueMarca: FonteDef = {
  contract: {
    fato: "fato_estoque_marca",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Marca", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "valorMarca", label: "Valor em estoque (marca)", tipo: "moeda" },
        { key: "marcasTotal", label: "Marcas no estoque", tipo: "numero" },
      ],
      tabela: [
        { key: "marca", label: "Marca", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.marcasBruto, freshness: null };
    },
    // KPI recortado por marca: usa filtros.marca (match por trecho, case-insensitive).
    // Sem filtro, o valorMarca soma todas as marcas (total geral).
    kpis: async (filtros) => {
      const d = await queryConcentracao(prisma);
      const alvo = (filtros.marca ?? "").trim().toLowerCase();
      const valorMarca = alvo
        ? d.marcasBruto
            .filter((m) => m.rotulo.toLowerCase().includes(alvo))
            .reduce((acc, m) => acc + m.valor, 0)
        : d.marcasBruto.reduce((acc, m) => acc + m.valor, 0);
      return { linhas: [], kpis: { valorMarca, marcasTotal: d.marcasBruto.length }, freshness: null };
    },
    tabela: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.marcasBruto.map((m) => ({ marca: m.rotulo, valor: m.valor })), freshness: null };
    },
  },
};

// --- Dimensao FAMILIA explicita (queryConcentracao.familiasBruto). ---
const fatoEstoqueFamilia: FonteDef = {
  contract: {
    fato: "fato_estoque_familia",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "tabela"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Familia", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
      tabela: [
        { key: "familia", label: "Familia", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.familiasBruto, freshness: null };
    },
    tabela: async () => {
      const d = await queryConcentracao(prisma);
      return { linhas: d.familiasBruto.map((f) => ({ familia: f.rotulo, valor: f.valor })), freshness: null };
    },
  },
};

// --- MOVIMENTO: entradas/saidas por mes (serie temporal) + detalhe. ---
const fatoEstoqueMovimento: FonteDef = {
  contract: {
    fato: "fato_estoque_movimento",
    modeloFonte: "estoque.movimento",
    dominio: "estoque",
    shapes: ["serieTemporal", "tabela"],
    campos: {
      serieTemporal: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "entrada", label: "Entradas", tipo: "numero" },
        { key: "saida", label: "Saidas", tipo: "numero" },
      ],
      tabela: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "sentido", label: "Sentido", tipo: "texto" },
        { key: "produto", label: "Produto", tipo: "texto" },
        { key: "quantidade", label: "Quantidade", tipo: "numero" },
      ],
    },
  },
  produtores: {
    serieTemporal: async (filtros) => {
      const d = await queryEntradasSaidas(prisma, {
        armazemId: filtros.armazemId,
        periodoDe: filtros.periodoDe,
        periodoAte: filtros.periodoAte,
      });
      return { linhas: d.serie as unknown as Record<string, unknown>[], freshness: null };
    },
    tabela: async (filtros) => {
      const d = await queryEntradasSaidas(prisma, {
        armazemId: filtros.armazemId,
        periodoDe: filtros.periodoDe,
        periodoAte: filtros.periodoAte,
      });
      return { linhas: d.detalhe as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- PRODUTOS PARADOS: kpis + tabela (queryProdutosParados). ---
const fatoEstoqueParados: FonteDef = {
  contract: {
    fato: "fato_estoque_parados",
    modeloFonte: "estoque.parado",
    dominio: "estoque",
    shapes: ["kpis", "tabela"],
    campos: {
      kpis: [
        { key: "totalParados", label: "Itens parados", tipo: "numero" },
        { key: "valorImobilizado", label: "Valor imobilizado", tipo: "moeda" },
      ],
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "localNome", label: "Armazem", tipo: "texto" },
        { key: "dias", label: "Dias parado", tipo: "numero" },
        { key: "saldo", label: "Saldo", tipo: "numero" },
        { key: "vrSaldo", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryProdutosParados(prisma, { faixaDias: filtros.faixaDias, armazemId: filtros.armazemId });
      return { linhas: [], kpis: { totalParados: d.kpis.totalParados, valorImobilizado: d.kpis.valorImobilizado }, freshness: null };
    },
    tabela: async (filtros) => {
      const d = await queryProdutosParados(prisma, { faixaDias: filtros.faixaDias, armazemId: filtros.armazemId });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

// --- TOP MOVIMENTADOS: produtos mais movimentados (queryTopMovimentados). ---
const fatoEstoqueTopMovimentados: FonteDef = {
  contract: {
    fato: "fato_estoque_top_movimentados",
    modeloFonte: "estoque.movimento",
    dominio: "estoque",
    shapes: ["agregacaoCategorica", "kpis"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Produto", tipo: "texto" },
        { key: "valor", label: "Unidades movimentadas", tipo: "numero" },
      ],
      kpis: [
        { key: "totalProdutos", label: "Produtos", tipo: "numero" },
        { key: "totalUnidades", label: "Unidades", tipo: "numero" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async (filtros) => {
      const d = await queryTopMovimentados(prisma, { sentido: filtros.sentido });
      return { linhas: d.linhas, freshness: null };
    },
    kpis: async (filtros) => {
      const d = await queryTopMovimentados(prisma, { sentido: filtros.sentido });
      return { linhas: [], kpis: { totalProdutos: d.kpis.totalProdutos, totalUnidades: d.kpis.totalUnidades }, freshness: null };
    },
  },
};

// ===========================================================================
// FINANCEIRO (onda 2): saldo bancario, fluxo de caixa (serie) e DRE gerencial.
// Reusa as queries auditadas de queries/financeiro*.ts , so wrap em FonteDef.
// ===========================================================================

const fatoFinanceiroSaldo: FonteDef = {
  contract: {
    fato: "fato_financeiro_saldo",
    modeloFonte: "financeiro.saldo",
    dominio: "financeiro",
    shapes: ["kpis", "agregacaoCategorica", "tabela"],
    campos: {
      kpis: [{ key: "saldoTotal", label: "Saldo total", tipo: "moeda" }],
      agregacaoCategorica: [
        { key: "rotulo", label: "Banco", tipo: "texto" },
        { key: "valor", label: "Saldo", tipo: "moeda" },
      ],
      tabela: [
        { key: "bancoNome", label: "Banco", tipo: "texto" },
        { key: "tipo", label: "Tipo", tipo: "texto" },
        { key: "saldo", label: "Saldo", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async () => {
      const d = await querySaldoContas(prisma);
      return { linhas: [], kpis: { saldoTotal: d.saldoTotal }, freshness: null };
    },
    agregacaoCategorica: async () => {
      const d = await querySaldoContas(prisma);
      return {
        linhas: d.contas.map((c) => ({ rotulo: c.bancoNome ?? "(sem banco)", valor: c.saldo })),
        freshness: null,
      };
    },
    tabela: async () => {
      const d = await querySaldoContas(prisma);
      return { linhas: d.contas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoFinanceiroMovimento: FonteDef = {
  contract: {
    fato: "fato_financeiro_movimento",
    modeloFonte: "financeiro.movimento",
    dominio: "financeiro",
    shapes: ["kpis", "serieTemporal"],
    campos: {
      kpis: [
        { key: "entrada", label: "Entradas", tipo: "moeda" },
        { key: "saida", label: "Saidas", tipo: "moeda" },
        { key: "saldo", label: "Caixa liquido", tipo: "moeda" },
      ],
      serieTemporal: [
        { key: "mes", label: "Mes", tipo: "texto" },
        { key: "realizado", label: "Realizado", tipo: "moeda" },
        { key: "previsto", label: "Previsto", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryCaixaPeriodo(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return { linhas: [], kpis: { entrada: d.entrada, saida: d.saida, saldo: d.saldo }, freshness: null };
    },
    serieTemporal: async (filtros) => {
      const d = await queryFluxoCaixa(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: d.serie.map((s) => ({ mes: s.periodo, realizado: s.realizado, previsto: s.previsto })),
        freshness: null,
      };
    },
  },
};

const fatoFinanceiroResultado: FonteDef = {
  contract: {
    fato: "fato_financeiro_resultado",
    modeloFonte: "financeiro.resultado",
    dominio: "financeiro",
    shapes: ["kpis", "agregacaoCategorica"],
    campos: {
      kpis: [
        { key: "totalReceita", label: "Receita", tipo: "moeda" },
        { key: "totalDespesa", label: "Despesa", tipo: "moeda" },
        { key: "resultado", label: "Resultado", tipo: "moeda" },
      ],
      agregacaoCategorica: [
        { key: "rotulo", label: "Conta gerencial", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryResultadoPorConta(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: [],
        kpis: { totalReceita: d.totalReceita, totalDespesa: d.totalDespesa, resultado: d.resultado },
        freshness: null,
      };
    },
    agregacaoCategorica: async (filtros) => {
      const d = await queryResultadoPorConta(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.contaNome ?? "(sem conta)", valor: l.total })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// COMERCIAL (onda 3): pedidos , KPIs, por etapa, por vendedor, atrasados.
// ===========================================================================

const fatoComercialPedido: FonteDef = {
  contract: {
    fato: "fato_comercial_pedido",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["kpis", "tabela"],
    campos: {
      kpis: [
        { key: "totalPedidos", label: "Pedidos", tipo: "numero" },
        { key: "valorTotal", label: "Valor em pedidos", tipo: "moeda" },
      ],
      tabela: [
        { key: "participanteNome", label: "Cliente", tipo: "texto" },
        { key: "numero", label: "Numero", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
        { key: "diasAtraso", label: "Dias em atraso", tipo: "numero" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryPedidosPeriodo(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return { linhas: [], kpis: { totalPedidos: d.totalPedidos, valorTotal: d.valorTotal }, freshness: null };
    },
    tabela: async () => {
      const d = await queryPedidosAtrasados(prisma, new Date(), { limit: 200 });
      return { linhas: d.linhas as unknown as Record<string, unknown>[], freshness: null };
    },
  },
};

const fatoComercialEtapa: FonteDef = {
  contract: {
    fato: "fato_comercial_etapa",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Etapa", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryPedidosPorEtapa(prisma);
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.etapaNome ?? "(sem etapa)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

const fatoComercialVendedor: FonteDef = {
  contract: {
    fato: "fato_comercial_vendedor",
    modeloFonte: "comercial.pedido",
    dominio: "comercial",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Vendedor", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async (filtros) => {
      const d = await queryPedidosPorVendedor(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.vendedorNome ?? "(sem vendedor)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// FISCAL (onda 4): faturamento (NF de saida) , KPIs, por cliente, por produto.
// ===========================================================================

const fatoFiscalFaturamento: FonteDef = {
  contract: {
    fato: "fato_fiscal_faturamento",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["kpis"],
    campos: {
      kpis: [
        { key: "totalNotas", label: "Notas emitidas", tipo: "numero" },
        { key: "valorFaturado", label: "Valor faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    kpis: async (filtros) => {
      const d = await queryFaturamentoPeriodo(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return { linhas: [], kpis: { totalNotas: d.totalNotas, valorFaturado: d.valorFaturado }, freshness: null };
    },
  },
};

const fatoFiscalCliente: FonteDef = {
  contract: {
    fato: "fato_fiscal_cliente",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Cliente", tipo: "texto" },
        { key: "valor", label: "Faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async (filtros) => {
      const d = await queryFaturamentoPorCliente(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.participanteNome ?? "(sem cliente)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

const fatoFiscalProduto: FonteDef = {
  contract: {
    fato: "fato_fiscal_produto",
    modeloFonte: "fiscal.nota",
    dominio: "fiscal",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "Produto", tipo: "texto" },
        { key: "valor", label: "Faturado", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async (filtros) => {
      const d = await queryProdutosFaturados(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte });
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.produtoNome ?? "(sem produto)", valor: l.valorTotal })),
        freshness: null,
      };
    },
  },
};

// ===========================================================================
// CADASTROS (onda 5): parceiros , KPIs (clientes/fornecedores/ativos) e por UF.
// ===========================================================================

const fatoCadastrosParceiro: FonteDef = {
  contract: {
    fato: "fato_cadastros_parceiro",
    modeloFonte: "cadastros.parceiro",
    dominio: "cadastros",
    shapes: ["kpis"],
    campos: {
      kpis: [
        { key: "totalClientes", label: "Clientes", tipo: "numero" },
        { key: "totalFornecedores", label: "Fornecedores", tipo: "numero" },
        { key: "totalAtivos", label: "Ativos", tipo: "numero" },
      ],
    },
  },
  produtores: {
    kpis: async () => {
      const d = await queryContarParceiros(prisma);
      return {
        linhas: [],
        kpis: { totalClientes: d.totalClientes, totalFornecedores: d.totalFornecedores, totalAtivos: d.totalAtivos },
        freshness: null,
      };
    },
  },
};

const fatoCadastrosUf: FonteDef = {
  contract: {
    fato: "fato_cadastros_uf",
    modeloFonte: "cadastros.parceiro",
    dominio: "cadastros",
    shapes: ["agregacaoCategorica"],
    campos: {
      agregacaoCategorica: [
        { key: "rotulo", label: "UF", tipo: "texto" },
        { key: "valor", label: "Parceiros", tipo: "numero" },
      ],
    },
  },
  produtores: {
    agregacaoCategorica: async () => {
      const d = await queryParceirosPorUf(prisma, {});
      return {
        linhas: d.linhas.map((l) => ({ rotulo: l.uf ?? "(sem UF)", valor: l.quantidade })),
        freshness: null,
      };
    },
  },
};

const REGISTRY: Record<string, FonteDef> = {
  fato_estoque_saldo: fatoEstoqueSaldo,
  fato_estoque_armazem: fatoEstoqueArmazem,
  fato_estoque_local_produto: fatoEstoqueLocalProduto,
  fato_estoque_marca: fatoEstoqueMarca,
  fato_estoque_familia: fatoEstoqueFamilia,
  fato_estoque_movimento: fatoEstoqueMovimento,
  fato_estoque_parados: fatoEstoqueParados,
  fato_estoque_top_movimentados: fatoEstoqueTopMovimentados,
  fato_financeiro_saldo: fatoFinanceiroSaldo,
  fato_financeiro_movimento: fatoFinanceiroMovimento,
  fato_financeiro_resultado: fatoFinanceiroResultado,
  fato_comercial_pedido: fatoComercialPedido,
  fato_comercial_etapa: fatoComercialEtapa,
  fato_comercial_vendedor: fatoComercialVendedor,
  fato_fiscal_faturamento: fatoFiscalFaturamento,
  fato_fiscal_cliente: fatoFiscalCliente,
  fato_fiscal_produto: fatoFiscalProduto,
  fato_cadastros_parceiro: fatoCadastrosParceiro,
  fato_cadastros_uf: fatoCadastrosUf,
};

/** Lista os contratos publicos de todas as fontes (alimenta o agente). */
export function listarFontes(): SourceContract[] {
  return Object.values(REGISTRY).map((f) => f.contract);
}

/** Contrato de uma fonte por fato. */
export function obterContrato(fato: string): SourceContract | undefined {
  return REGISTRY[fato]?.contract;
}

/** Produtor de dado para um par (fato, shapeDerivado). */
export function obterProdutor(
  fato: string,
  shape: ShapeDerivado,
): Produtor | undefined {
  return REGISTRY[fato]?.produtores[shape];
}
