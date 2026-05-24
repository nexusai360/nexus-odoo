/**
 * Utilitários puros da DataTable , extraídos para facilitar TDD.
 * Sem dependências de React.
 */

import type { ColumnDef } from "./data-table";

export interface SortEntry {
  key: string;
  dir: "asc" | "desc";
}

/**
 * Aplica uma stack de critérios de ordenação sobre um array de linhas.
 * Preserva a ordem original como critério de desempate (sort estável).
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  sortStack: SortEntry[],
  columns: ColumnDef<T>[],
): T[] {
  if (sortStack.length === 0) return rows;
  const colMap = new Map(columns.map((c) => [c.key, c]));
  const decorated = rows.map((row, idx) => ({ row, idx }));
  decorated.sort((A, B) => {
    for (const entry of sortStack) {
      const col = colMap.get(entry.key);
      const av = A.row[entry.key];
      const bv = B.row[entry.key];
      let cmp: number;
      if (col?.tipo === "numero" || col?.tipo === "moeda" || col?.tipo === "percentual") {
        cmp = Number(av ?? 0) - Number(bv ?? 0);
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
      }
      if (cmp !== 0) return entry.dir === "asc" ? cmp : -cmp;
    }
    return A.idx - B.idx; // desempate estável
  });
  return decorated.map((d) => d.row);
}

/**
 * Filtra um array de linhas pelo termo de busca, varrendo TODAS as colunas
 * (texto e número convertido para string). Case-insensitive.
 */
export function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    Object.values(row).some((v) =>
      String(v ?? "").toLowerCase().includes(q),
    ),
  );
}

/**
 * Atualiza a stack de multi-sort ao clicar num cabeçalho.
 *
 * - Clique simples: cicla asc → desc → remove (substitui a stack inteira).
 * - Shift+clique: acumula a coluna na stack existente usando o mesmo ciclo.
 */
export function toggleSortStack(
  stack: SortEntry[],
  key: string,
  shiftKey: boolean,
): SortEntry[] {
  const idx = stack.findIndex((e) => e.key === key);

  if (shiftKey) {
    // Modo aditivo: acumula na stack
    if (idx === -1) {
      return [...stack, { key, dir: "asc" }];
    }
    const current = stack[idx]!;
    if (current.dir === "asc") {
      const next = [...stack];
      next[idx] = { key, dir: "desc" };
      return next;
    }
    // desc → remove da stack
    return stack.filter((_, i) => i !== idx);
  }

  // Clique simples: substitui a stack
  if (idx === -1 || stack.length > 1) {
    return [{ key, dir: "asc" }];
  }
  const current = stack[idx]!;
  if (current.dir === "asc") return [{ key, dir: "desc" }];
  return []; // desc → sem ordenação
}
