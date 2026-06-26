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
