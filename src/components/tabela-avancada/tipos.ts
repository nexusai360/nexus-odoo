/**
 * Tipos genéricos da tabela avançada (independente de domínio). O catálogo de
 * cada tela (ex.: entregas-catalogo.tsx) instancia `ColunaDef`/`CampoDef` com o
 * seu shape de linha.
 */

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
  /** visível no conjunto default. */
  padrao: boolean;
  /** obrigatória: sempre visível, não desmarcável nem reordenável. */
  obrigatoria?: boolean;
  /** valor para ordenação/agrupamento. */
  valor: (row: T) => string | number;
  /** largura do campo na TELA DE DETALHE (1 = normal, 2 = largo, 4 = linha inteira). */
  detalheSpan?: 1 | 2 | 4;
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
