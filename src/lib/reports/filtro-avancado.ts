// src/lib/reports/filtro-avancado.ts
//
// Modelo serializável de filtro avançado:
// - Condicao: campo · operador · valor
// - Grupo: conector E|OU + lista de Condicao|Grupo (recursivo)
// - compilarFiltro: compila um Grupo em predicado (row) => boolean
//
// Reutilizável pela F6 (construtor de relatórios) , sem acoplamento a nenhum
// relatório específico.

import type { ColumnDef } from "@/components/charts/data-table";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type Operador =
  | "igual"
  | "diferente"
  | "contem"
  | "nao_contem"
  | "vazio"
  | "preenchido"
  | "maior"
  | "menor"
  | "esta_em_lista";

/**
 * Separador usado para serializar a lista de valores do operador
 * `esta_em_lista` dentro de `Condicao.valor` (que é sempre string). Usa o
 * caractere de controle "unit separator" (U+001F), improvável no dado real.
 */
export const SEP_LISTA = "";

export interface Condicao {
  campo: string;
  operador: Operador;
  valor: string;
}

export interface Grupo {
  conector: "E" | "OU";
  itens: GrupoItem[];
}

/** Um item dentro de um Grupo pode ser uma Condicao folha ou um Grupo aninhado. */
export type GrupoItem = Condicao | Grupo;

/** Metadados de um operador para exibição no UI. */
export interface OperadorMeta {
  value: Operador;
  label: string;
}

/**
 * Operadores VISÍVEIS no builder manual. `esta_em_lista` é intencionalmente
 * omitido: ele é programático (usado pela busca inteligente por facets), não
 * editável à mão. Use `operadoresParaTipo` para filtrar esta lista pelo tipo
 * da coluna escolhida.
 */
export const OPERADORES: OperadorMeta[] = [
  { value: "igual", label: "igual a" },
  { value: "diferente", label: "diferente de" },
  { value: "contem", label: "contém" },
  { value: "nao_contem", label: "não contém" },
  { value: "vazio", label: "é vazio" },
  { value: "preenchido", label: "não é vazio" },
  { value: "maior", label: "maior que" },
  { value: "menor", label: "menor que" },
];

/** Fábrica de grupo vazio (objeto novo a cada chamada, nunca compartilhado). */
export function grupoVazio(): Grupo {
  return { conector: "E", itens: [] };
}

/**
 * Operadores válidos para o tipo de uma coluna. Colunas ordenáveis
 * (data/numero/moeda/percentual) ganham `maior`/`menor` e perdem
 * `contem`/`nao_contem` (que não fazem sentido); texto/tag o inverso.
 * `vazio`/`preenchido` valem para todos.
 */
export function operadoresParaTipo(tipo: string): Operador[] {
  if (
    tipo === "data" ||
    tipo === "numero" ||
    tipo === "moeda" ||
    tipo === "percentual"
  ) {
    return ["igual", "diferente", "maior", "menor", "vazio", "preenchido"];
  }
  return ["igual", "diferente", "contem", "nao_contem", "vazio", "preenchido"];
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Retorna `true` quando o item é um Grupo (tem `conector`), falso = Condicao. */
export function isGrupo(item: GrupoItem): item is Grupo {
  return "conector" in item;
}

// ---------------------------------------------------------------------------
// compilarFiltro
// ---------------------------------------------------------------------------

/**
 * Compila um `Grupo` em um predicado puro `(row) => boolean`.
 *
 * @param grupo - Estrutura de filtro serializada.
 * @param columns - Colunas da DataTable , usadas para inferir o tipo de cada
 *   campo ("numero" | "moeda" → comparação numérica; "texto" → string).
 *
 * Comportamentos garantidos:
 * - Grupo vazio (0 itens) → predicado sempre `true` (sem filtro).
 * - Condicao com `campo` vazio → condição ignorada (sempre `true`).
 * - Comparações numéricas: `maior` / `menor` convertem `valor` para Number;
 *   se a conversão falhar retornam `false`.
 * - `contem` é case-insensitive.
 * - Grupos aninhados são avaliados recursivamente.
 */
export function compilarFiltro<T extends Record<string, unknown>>(
  grupo: Grupo,
  columns: ColumnDef<T>[],
): (row: T) => boolean {
  if (grupo.itens.length === 0) return () => true;

  const typeMap = Object.fromEntries(
    columns.map((c) => [c.key as string, c.tipo]),
  );

  function avaliarCondicao(row: T, c: Condicao): boolean {
    if (!c.campo) return true;

    const rawVal = row[c.campo];
    const tipo = typeMap[c.campo] ?? "texto";
    const isNumeric =
      tipo === "numero" || tipo === "moeda" || tipo === "percentual";
    const isData = tipo === "data";
    const s = String(rawVal ?? "");

    switch (c.operador) {
      case "igual":
        if (isNumeric) return Number(rawVal) === Number(c.valor);
        return s.toLowerCase() === c.valor.toLowerCase();

      case "diferente":
        if (isNumeric) return Number(rawVal) !== Number(c.valor);
        return s.toLowerCase() !== c.valor.toLowerCase();

      case "contem":
        // Guard: enquanto o usuário não digitou, a condição é inerte (não zera
        // a tabela). `includes("")` seria sempre true de qualquer forma.
        if (c.valor === "") return true;
        return s.toLowerCase().includes(c.valor.toLowerCase());

      case "nao_contem":
        // Guard: sem valor, inerte. Sem o guard, `!includes("")` seria sempre
        // false e a tabela ficaria vazia sem explicação.
        if (c.valor === "") return true;
        return !s.toLowerCase().includes(c.valor.toLowerCase());

      case "vazio":
        return s.trim() === "";

      case "preenchido":
        return s.trim() !== "";

      case "maior": {
        if (isNumeric) {
          const n = Number(c.valor);
          return Number.isNaN(n) ? false : Number(rawVal) > n;
        }
        // Data ISO (YYYY-MM-DD): comparação lexicográfica = cronológica.
        if (isData) return s !== "" && s > c.valor;
        return s.toLowerCase() > c.valor.toLowerCase();
      }

      case "menor": {
        if (isNumeric) {
          const n = Number(c.valor);
          return Number.isNaN(n) ? false : Number(rawVal) < n;
        }
        if (isData) return s !== "" && s < c.valor;
        return s.toLowerCase() < c.valor.toLowerCase();
      }

      case "esta_em_lista": {
        const vals = c.valor
          .split(SEP_LISTA)
          .filter((v) => v !== "")
          .map((v) => v.toLowerCase());
        if (vals.length === 0) return true; // inerte
        return vals.includes(s.toLowerCase());
      }

      default:
        return true;
    }
  }

  function avaliarItem(row: T, item: GrupoItem): boolean {
    if (isGrupo(item)) {
      return avaliarGrupo(row, item);
    }
    return avaliarCondicao(row, item);
  }

  function avaliarGrupo(row: T, g: Grupo): boolean {
    if (g.itens.length === 0) return true;
    if (g.conector === "E") {
      return g.itens.every((item) => avaliarItem(row, item));
    }
    return g.itens.some((item) => avaliarItem(row, item));
  }

  return (row: T) => avaliarGrupo(row, grupo);
}
