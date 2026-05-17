// src/lib/reports/filtro-avancado.ts
//
// Modelo serializável de filtro avançado:
// - Condicao: campo · operador · valor
// - Grupo: conector E|OU + lista de Condicao|Grupo (recursivo)
// - compilarFiltro: compila um Grupo em predicado (row) => boolean
//
// Reutilizável pela F6 (construtor de relatórios) — sem acoplamento a nenhum
// relatório específico.

import type { ColumnDef } from "@/components/charts/data-table";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type Operador =
  | "igual"
  | "diferente"
  | "contem"
  | "maior"
  | "menor";

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

export const OPERADORES: OperadorMeta[] = [
  { value: "igual", label: "igual a" },
  { value: "diferente", label: "diferente de" },
  { value: "contem", label: "contém" },
  { value: "maior", label: "maior que" },
  { value: "menor", label: "menor que" },
];

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
 * @param columns - Colunas da DataTable — usadas para inferir o tipo de cada
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
    const isNumeric = tipo === "numero" || tipo === "moeda";

    switch (c.operador) {
      case "igual":
        if (isNumeric) {
          const n = Number(c.valor);
          return Number(rawVal) === n;
        }
        return String(rawVal ?? "").toLowerCase() === c.valor.toLowerCase();

      case "diferente":
        if (isNumeric) {
          const n = Number(c.valor);
          return Number(rawVal) !== n;
        }
        return String(rawVal ?? "").toLowerCase() !== c.valor.toLowerCase();

      case "contem":
        return String(rawVal ?? "")
          .toLowerCase()
          .includes(c.valor.toLowerCase());

      case "maior": {
        const n = Number(c.valor);
        if (Number.isNaN(n)) return false;
        return Number(rawVal) > n;
      }

      case "menor": {
        const n = Number(c.valor);
        if (Number.isNaN(n)) return false;
        return Number(rawVal) < n;
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
