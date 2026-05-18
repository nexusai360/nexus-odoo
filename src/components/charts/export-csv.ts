/**
 * Exportação CSV — função pura, sem dependências de React/DOM.
 *
 * Convenções pt-BR:
 *  - Separador: ponto-e-vírgula (;)
 *  - BOM UTF-8 (﻿) para compatibilidade com Excel
 *  - Números sem formatação de moeda (Excel converte pelo locale)
 *  - Aspas duplas escapadas por duplicação ("" → dentro de campo com aspas)
 */

import type { ColumnDef } from "./data-table";

/** Escapa um valor para célula CSV: envolve em aspas se necessário. */
function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(";") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Converte um valor de linha para string plana (sem símbolos de moeda). */
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    // Números simples — Excel interpreta pelo locale do SO
    return String(value);
  }
  return String(value);
}

/**
 * Gera uma string CSV a partir de colunas e linhas.
 * Inclui BOM UTF-8 para abertura correta no Excel pt-BR.
 */
export function gerarCsv<T extends Record<string, unknown>>(
  columns: ColumnDef<T>[],
  rows: T[],
): string {
  const BOM = "﻿";
  const header = columns.map((c) => escapeCsvCell(c.header)).join(";");
  const body = rows
    .map((row) =>
      columns
        .map((c) => escapeCsvCell(cellToString(row[c.key])))
        .join(";"),
    )
    .join("\n");
  return `${BOM}${header}\n${body}`;
}

/**
 * Dispara o download de uma string como arquivo .csv no browser.
 * @param content  String CSV (com BOM)
 * @param filename Nome base do arquivo (sem extensão)
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
