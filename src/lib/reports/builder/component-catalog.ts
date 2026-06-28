// src/lib/reports/builder/component-catalog.ts
// Catalogo de componentes de visualizacao, documentado para humano e maquina.
// E o que o agente le para escolher o componente certo (spec 6). Onda 1: so
// DataTable (o mais config-driven). Demais entram nas ondas seguintes.
import type { ReportTemplate, ShapeDerivado } from "./types";

export interface ComponentEntry {
  /** Chave = template do ReportEntry. */
  chave: ReportTemplate;
  nome: string;
  paraQueServe: string;
  quandoUsar: string;
  quandoNaoUsar: string;
  /** Shape derivado que este componente consome. */
  shapeDerivadoExigido: ShapeDerivado;
  /** Parametros expostos (nome + descricao curta). */
  parametros: { chave: string; descricao: string }[];
  /** Capacidades de interacao declaradas (mesmo se implementadas depois). */
  interacao: string[];
  /** Tokens visuais por estado, referenciando o design system. */
  tokensVisuais: Record<string, string>;
}

export const COMPONENT_CATALOG: ComponentEntry[] = [
  {
    chave: "KPIRow",
    nome: "Faixa de indicadores",
    paraQueServe:
      "Mostrar 2 a 6 numeros-chave (totais, valor, contagens) em destaque no topo do relatorio.",
    quandoUsar:
      "Sempre que a fonte oferecer o shape 'kpis'. Use no TOPO, antes do grafico e da tabela, para dar o panorama.",
    quandoNaoUsar:
      "Detalhe linha a linha (use tabela) ou comparar muitas categorias (use barra).",
    shapeDerivadoExigido: "kpis",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional da faixa." }],
    interacao: ["destaque_numerico"],
    tokensVisuais: { cartao: "kpi.card", icone: "kpi.tone" },
  },
  {
    chave: "BarChart",
    nome: "Grafico de barras",
    paraQueServe:
      "Comparar um valor entre categorias (ex.: valor por familia, saldo por armazem).",
    quandoUsar:
      "Quando a fonte oferecer 'agregacaoCategorica'. Use entre os KPIs e a tabela para uma leitura visual rapida.",
    quandoNaoUsar:
      "Muitos itens sem ranking (use tabela) ou serie no tempo (use linha).",
    shapeDerivadoExigido: "agregacaoCategorica",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional do grafico." }],
    interacao: ["tooltip", "topN"],
    tokensVisuais: { barra: "chart.bar", grade: "chart.grid" },
  },
  {
    chave: "LineChart",
    nome: "Grafico de linha",
    paraQueServe:
      "Mostrar a evolucao de um ou mais valores ao longo do tempo (serie temporal).",
    quandoUsar:
      "Quando a fonte oferecer 'serieTemporal' (ex.: entradas e saidas por mes).",
    quandoNaoUsar:
      "Comparar categorias sem tempo (use barra) ou proporcao (use pizza).",
    shapeDerivadoExigido: "serieTemporal",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional do grafico." }],
    interacao: ["tooltip", "legenda", "multi_serie"],
    tokensVisuais: { linha: "chart.line", area: "chart.area" },
  },
  {
    chave: "PieChart",
    nome: "Grafico de pizza",
    paraQueServe:
      "Mostrar a proporcao (a fatia de cada categoria) sobre um total. Usa o mesmo shape do grafico de barras.",
    quandoUsar:
      "Poucas categorias (ate ~6) e a intencao e ver participacao/percentual de cada uma.",
    quandoNaoUsar:
      "Muitas categorias (use barra) ou comparar valores precisos (use barra/tabela).",
    shapeDerivadoExigido: "agregacaoCategorica",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional do grafico." }],
    interacao: ["tooltip", "legenda", "agrupar_outros"],
    tokensVisuais: { fatia: "chart.pie", legenda: "chart.legend" },
  },
  {
    chave: "Funnel",
    nome: "Funil de conversao",
    paraQueServe:
      "Mostrar estagios em sequencia decrescente (pipeline): quanto cada etapa concentra do total. Usa o mesmo shape do grafico de barras.",
    quandoUsar:
      "Poucos estagios ordenaveis (ex.: pedidos por etapa do funil comercial), para ler a concentracao/queda entre etapas.",
    quandoNaoUsar:
      "Categorias sem ideia de etapa/sequencia (use barra) ou serie no tempo (use linha).",
    shapeDerivadoExigido: "agregacaoCategorica",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional do funil." }],
    interacao: ["tooltip", "share_percentual"],
    tokensVisuais: { estagio: "chart.bar", rotulo: "chart.legend" },
  },
  {
    chave: "Waterfall",
    nome: "Cascata (waterfall)",
    paraQueServe:
      "Mostrar como um valor de partida (receita) chega a um resultado, passo a passo, somando e subtraindo (DRE).",
    quandoUsar:
      "Decomposicao de um resultado financeiro/contabil: receita menos despesas ate o resultado. Usa o shape 'cascata' (passos com sinal).",
    quandoNaoUsar:
      "Comparar categorias sem ideia de acumulo (use barra) ou proporcao (use pizza).",
    shapeDerivadoExigido: "cascata",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional da cascata." }],
    interacao: ["tooltip", "acumulado"],
    tokensVisuais: { sobe: "chart.positive", desce: "chart.negative", total: "chart.bar" },
  },
  {
    chave: "Combo",
    nome: "Combinado (barra + linha)",
    paraQueServe:
      "Combinar uma serie como barras (o realizado) com outra(s) como linha(s) (previsto/meta) no mesmo eixo de tempo.",
    quandoUsar:
      "Serie temporal com 2+ medidas onde uma e o realizado e outra e referencia (ex.: fluxo de caixa realizado x previsto).",
    quandoNaoUsar:
      "Uma unica serie (use linha) ou comparacao por categoria sem tempo (use barra).",
    shapeDerivadoExigido: "serieTemporal",
    parametros: [{ chave: "titulo", descricao: "Titulo curto opcional do grafico." }],
    interacao: ["tooltip", "legenda", "barra_mais_linha"],
    tokensVisuais: { barra: "chart.bar", linha: "chart.line" },
  },
  {
    chave: "DataTable",
    nome: "Tabela de dados",
    paraQueServe:
      "Listar linhas com varias colunas; busca, ordenacao e exportacao CSV.",
    quandoUsar:
      "Detalhe linha a linha (ex.: saldo por produto), muitas colunas, valores precisos.",
    quandoNaoUsar:
      "Comparar poucas categorias visualmente (use pizza/barra) ou serie temporal (use linha).",
    shapeDerivadoExigido: "tabela",
    parametros: [
      { chave: "colunas", descricao: "Lista de colunas (key, header, tipo)." },
      { chave: "searchable", descricao: "Liga a busca por texto." },
    ],
    interacao: ["busca", "ordenacao", "exportacao_csv", "expandir_detalhe"],
    tokensVisuais: {
      borda: "card.border",
      cabecalhoFixo: "table.header.sticky",
      hoverLinha: "table.row.hover",
    },
  },
];

export function listarComponentes(): ComponentEntry[] {
  return COMPONENT_CATALOG;
}

export function descreverComponente(
  chave: string,
): ComponentEntry | undefined {
  return COMPONENT_CATALOG.find((c) => c.chave === chave);
}
