// src/lib/reports/catalog.ts
import { Boxes, Coins, ArrowLeftRight, Clock, TrendingUp, PieChart } from "lucide-react";
import type { ReportEntry } from "./types";

/** Catálogo declarativo dos 6 relatórios de estoque (lote 1). */
export const REPORT_CATALOG: ReportEntry[] = [
  {
    id: "saldo-produto",
    titulo: "Saldo por produto e armazém",
    dominio: "estoque",
    descricao: "Saldo de estoque por produto e local, incluindo negativos.",
    icone: Boxes,
    modeloFonte: "estoque.saldo.hoje",
    secoes: [
      {
        id: "tabela",
        template: "DataTable",
        fato: "fato_estoque_saldo",
        config: {
          colunas: [
            { key: "produtoNome", header: "Produto", tipo: "texto" },
            { key: "localNome", header: "Armazém", tipo: "texto" },
            { key: "familiaNome", header: "Família", tipo: "texto" },
            { key: "quantidade", header: "Saldo", tipo: "numero" },
            { key: "unidade", header: "Unidade", tipo: "texto" },
          ],
          searchable: true,
        },
        filtros: [
          { tipo: "produto" },
          { tipo: "armazem" },
          { tipo: "familia" },
          { tipo: "busca" },
        ],
      },
    ],
  },
  {
    id: "valor-armazem",
    titulo: "Valor de estoque por armazém",
    dominio: "estoque",
    descricao: "Valor financeiro do estoque agregado por armazém.",
    icone: Coins,
    modeloFonte: "estoque.saldo.hoje",
    secoes: [
      {
        id: "barras",
        template: "BarChart",
        fato: "fato_estoque_saldo",
        config: { xKey: "rotulo", yKey: "valor", formato: "moeda" },
        filtros: [],
      },
    ],
  },
  {
    id: "entradas-saidas",
    titulo: "Entradas vs. saídas por mês",
    dominio: "estoque",
    descricao: "Movimento físico de entrada e saída agregado por mês.",
    icone: ArrowLeftRight,
    modeloFonte: "estoque.extrato",
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
        filtros: [{ tipo: "periodo", default: "3" }, { tipo: "armazem" }],
      },
    ],
  },
  {
    id: "produtos-parados",
    titulo: "Produtos parados",
    dominio: "estoque",
    descricao: "Produtos com saldo imobilizado e tempo sem movimento.",
    icone: Clock,
    modeloFonte: "estoque.saldo.hoje.duracao.dias",
    secoes: [
      {
        id: "kpi",
        template: "KPICard",
        fato: "fato_produto_parado",
        config: { rotulo: "Produtos parados", formato: "inteiro" },
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
            { key: "vrSaldo", header: "Valor", tipo: "numero" },
          ],
          searchable: true,
        },
        filtros: [{ tipo: "faixaDias", default: "30" }, { tipo: "armazem" }],
      },
    ],
  },
];
