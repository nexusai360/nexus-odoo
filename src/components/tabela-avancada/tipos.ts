/**
 * Tipos genéricos da tabela avançada (independente de domínio). O catálogo de
 * cada tela (ex.: entregas-catalogo.tsx) instancia `ColunaDef`/`CampoDef` com o
 * seu shape de linha.
 */

import type { ReactNode } from "react";

import type { CampoTipo } from "./motor-filtro";

/** Como uma célula é renderizada. */
export type CelulaTipo =
  | "texto"
  | "numero"
  | "moeda"
  | "data"
  | "tagCor"
  | "status"
  | "percent";

/** Coluna da tabela (exibição + sort + agrupamento). */
export interface ColunaDef<T> {
  key: string;
  label: string;
  tipo: CelulaTipo;
  /** ordenável por clique no cabeçalho. */
  sortable: boolean;
  /** numérica: alinha à direita e compara como número no sort. */
  numeric: boolean;
  /** alinhamento da coluna (sobrepõe o default: numérica -> "right", senão "left").
   * "center" serve para colunas de ícone/status, onde o ícone deve ficar no meio. */
  align?: "left" | "center" | "right";
  /** tooltip mostrado ao passar o mouse no cabeçalho da coluna (ex.: nota de rodapé). */
  tooltipHeader?: string;
  /** visível no conjunto default. */
  padrao: boolean;
  /** obrigatória: sempre visível, não desmarcável nem reordenável. */
  obrigatoria?: boolean;
  /** valor para exibição/facets/CSV (e ordenação, quando não há `sortKey`). */
  valor: (row: T) => string | number;
  /** chave de ordenação alternativa (quando a ordem natural difere do display;
   * ex.: CNPJ/CEP ordenados pelo número dos dígitos, ignorando pontuação). */
  sortKey?: (row: T) => string | number;
  /** largura do campo na TELA DE DETALHE (1 = normal, 2 = largo, 4 = linha inteira). */
  detalheSpan?: 1 | 2 | 4;
  /** Conteúdo da linha de TOTAL (rodapé fixo) desta coluna, calculado sobre TODAS as
   * linhas filtradas (não só a página atual). Ausente = célula de total vazia.
   * O domínio decide o agregado (soma, contagem, margem geral, tag de contagem…). */
  rodape?: (rows: T[]) => ReactNode;
}

/** Campo para filtro/busca/agrupamento (curado por domínio). */
export interface CampoDef<T> {
  key: string;
  label: string;
  tipo: CampoTipo;
  /** domínio (aparece à direita no seletor de campo do filtro). */
  grupo: string;
  /** aparece na aba "campos comuns" (curados). */
  comum: boolean;
  opcoes?: { valor: string; label: string }[];
  get: (row: T) => string | number | string[];
  /** chave de agrupamento legível (default = get como string). */
  grupoKey?: (row: T) => string;
}
