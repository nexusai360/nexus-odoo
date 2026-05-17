// src/lib/reports/catalog.ts
import type { PlatformRole } from "@/generated/prisma/client";
import { visibleDomains, type ReportDomainId } from "@/lib/reports/domains";
import type { ReportEntry } from "./types";

/** Catálogo declarativo dos 6 relatórios de estoque (lote 1). */
export const REPORT_CATALOG: ReportEntry[] = [
  {
    id: "saldo-produto",
    titulo: "Saldo por produto",
    dominio: "estoque",
    descricao: "Saldo agregado de estoque por produto, incluindo negativos.",
    icone: "Boxes",
    modeloFonte: "estoque.saldo.hoje",
    secoes: [
      {
        id: "kpis",
        template: "KPIRow",
        fato: "fato_estoque_saldo",
        config: {},
        filtros: [{ tipo: "armazem" }, { tipo: "familia" }],
      },
      {
        id: "tabela",
        template: "DataTable",
        fato: "fato_estoque_saldo",
        config: {
          colunas: [
            { key: "produtoNome", header: "Produto", tipo: "texto" },
            { key: "familiaNome", header: "Família", tipo: "texto" },
            { key: "marcaNome", header: "Marca", tipo: "texto" },
            { key: "saldoTotal", header: "Saldo", tipo: "numero" },
            { key: "valorTotal", header: "Valor", tipo: "moeda" },
            { key: "numLocais", header: "Locais", tipo: "numero" },
          ],
          searchable: true,
        },
        filtros: [{ tipo: "armazem" }, { tipo: "familia" }],
      },
    ],
  },
  {
    id: "valor-armazem",
    titulo: "Valor de estoque por armazém",
    dominio: "estoque",
    descricao: "Valor financeiro do estoque agregado por armazém.",
    icone: "Coins",
    modeloFonte: "estoque.saldo.hoje",
    secoes: [
      {
        id: "kpis",
        template: "KPIRow",
        fato: "fato_estoque_saldo",
        config: { variante: "valor-armazem" },
        filtros: [],
      },
      {
        id: "tabela",
        template: "DataTable",
        fato: "fato_estoque_saldo",
        config: {
          colunas: [
            { key: "armazem", header: "Armazém", tipo: "texto" },
            { key: "valor", header: "Valor", tipo: "moeda" },
            { key: "numProdutos", header: "Produtos", tipo: "numero" },
            { key: "percentual", header: "% do total", tipo: "percentual" },
          ],
          searchable: true,
        },
        filtros: [],
      },
      {
        id: "top8",
        template: "BarChart",
        fato: "fato_estoque_saldo",
        config: { xKey: "rotulo", yKey: "valor", formato: "moeda", titulo: "Top 8 armazéns" },
        filtros: [],
      },
    ],
  },
  {
    id: "entradas-saidas",
    titulo: "Entradas vs. saídas por mês",
    dominio: "estoque",
    descricao: "Movimento físico de entrada e saída agregado por mês.",
    icone: "ArrowLeftRight",
    modeloFonte: "estoque.extrato",
    temporal: { periodoPadrao: "3meses" },
    secoes: [
      {
        id: "linha",
        template: "LineChart",
        fato: "fato_estoque_movimento",
        config: {
          xKey: "mes",
          formato: "inteiro",
          series: [
            { key: "entrada", label: "Entradas" },
            { key: "saida", label: "Saídas" },
          ],
        },
        filtros: [{ tipo: "armazem" }],
      },
      {
        id: "detalhe",
        template: "DataTable",
        fato: "fato_estoque_movimento",
        config: {
          colunas: [
            { key: "mes", header: "Mês", tipo: "texto" },
            { key: "sentido", header: "Sentido", tipo: "texto" },
            { key: "produto", header: "Produto", tipo: "texto" },
            { key: "quantidade", header: "Quantidade", tipo: "numero" },
          ],
          searchable: true,
        },
        filtros: [{ tipo: "armazem" }],
      },
    ],
  },
  {
    id: "produtos-parados",
    titulo: "Produtos parados",
    dominio: "estoque",
    descricao: "Produtos com saldo imobilizado e tempo sem movimento.",
    icone: "Clock",
    modeloFonte: "estoque.saldo.hoje.duracao.dias",
    secoes: [
      {
        id: "kpis",
        template: "KPIRow",
        fato: "fato_produto_parado",
        config: { variante: "produtos-parados" },
        filtros: [{ tipo: "faixaDias", default: "30" }, { tipo: "armazem" }],
      },
      {
        id: "tabela",
        template: "DataTable",
        fato: "fato_produto_parado",
        config: {
          colunas: [
            { key: "produtoNome", header: "Produto", tipo: "texto" },
            { key: "localNome", header: "Armazém", tipo: "texto" },
            { key: "saldo", header: "Saldo", tipo: "numero" },
            { key: "dias", header: "Dias parado", tipo: "numero" },
            { key: "vrSaldo", header: "Valor imobilizado", tipo: "moeda" },
          ],
          searchable: true,
        },
        filtros: [{ tipo: "faixaDias", default: "30" }, { tipo: "armazem" }],
      },
    ],
  },
  {
    id: "top-movimentados",
    titulo: "Top produtos movimentados",
    dominio: "estoque",
    descricao: "Produtos com maior movimento físico no período.",
    icone: "TrendingUp",
    modeloFonte: "estoque.extrato",
    temporal: { periodoPadrao: "3meses" },
    secoes: [
      {
        id: "kpis",
        template: "KPIRow",
        fato: "fato_estoque_movimento",
        config: { variante: "top-movimentados" },
        filtros: [{ tipo: "sentido" }],
      },
      {
        id: "barras",
        template: "BarChart",
        fato: "fato_estoque_movimento",
        config: { xKey: "rotulo", yKey: "valor", formato: "inteiro", titulo: "Top 10 produtos" },
        filtros: [{ tipo: "sentido" }],
      },
      {
        id: "linhas",
        template: "DataTable",
        fato: "fato_estoque_movimento",
        config: {
          colunas: [
            { key: "rotulo", header: "Produto", tipo: "texto" },
            { key: "valor", header: "Unidades movimentadas", tipo: "numero" },
          ],
          searchable: true,
        },
        filtros: [{ tipo: "sentido" }],
      },
    ],
  },
  {
    id: "concentracao",
    titulo: "Concentração do estoque",
    dominio: "estoque",
    descricao: "Distribuição do valor de estoque por família e por marca.",
    icone: "PieChart",
    modeloFonte: "estoque.saldo.hoje",
    secoes: [
      {
        id: "familia",
        template: "PieChart",
        fato: "fato_estoque_saldo",
        config: { nameKey: "rotulo", valueKey: "valor", formato: "moeda" },
        filtros: [],
      },
      {
        id: "marca",
        template: "BarChart",
        fato: "fato_estoque_saldo",
        config: { xKey: "rotulo", yKey: "valor", formato: "moeda" },
        filtros: [],
      },
    ],
  },
];

/** Relatórios visíveis ao usuário, filtrados pelo domínio. */
export function reportsForUser(
  role: PlatformRole,
  domains: ReportDomainId[],
): ReportEntry[] {
  const visiveis = visibleDomains(role, domains);
  return REPORT_CATALOG.filter((r) => visiveis.includes(r.dominio));
}

/** Busca uma entrada de catálogo pelo id. */
export function getReport(id: string): ReportEntry | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}
