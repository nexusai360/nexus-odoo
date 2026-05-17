"use client";

import { useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type ChartState } from "./kpi-card";

export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  tipo: "texto" | "numero";
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  estado?: ChartState;
  onRetry?: () => void;
  searchable?: boolean;
}

type SortDir = "asc" | "desc";

/**
 * Chave estável de linha: prefere um id explícito da linha; cai para o
 * índice apenas quando nenhum id está presente (IM-07). Evita que ordenar
 * ou pesquisar reassocie o DOM por posição.
 */
function rowKey(row: Record<string, unknown>, index: number): string | number {
  for (const k of ["produtoId", "odooId", "id", "saldoHojeId"]) {
    const v = row[k];
    if (typeof v === "number" || typeof v === "string") return `${k}:${v}`;
  }
  return index;
}

/** Tabela genérica ordenável e pesquisável; formata números pt-BR. */
export function DataTable<T extends Record<string, unknown>>({
  columns, rows, estado = "ok", onRetry, searchable = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) =>
        String(r[c.key] ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (col?.tipo === "numero") {
        cmp = Number(av ?? 0) - Number(bv ?? 0);
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (estado === "preparando") return <ChartPreparing />;
  if (estado === "erro") {
    return (
      <ChartError
        message="Erro ao carregar a tabela."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }
  if (estado === "vazio" || rows.length === 0) return <ChartEmpty />;

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <Input
          placeholder="Pesquisar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => {
              const active = sortKey === c.key;
              return (
                <TableHead
                  key={c.key}
                  aria-sort={
                    active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="font-medium"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.header}
                    {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <ChartEmpty />
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row, i) => (
              <TableRow key={rowKey(row, i)}>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(c.tipo === "numero" && "tabular-nums")}
                  >
                    {c.tipo === "numero"
                      ? formatNumber(Number(row[c.key] ?? 0), "decimal")
                      : String(row[c.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
