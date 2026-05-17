"use client";

import { useMemo, useState } from "react";
import { Columns2, WrapText } from "lucide-react";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
import { formatNumber, type ChartState } from "./kpi-card";

export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  tipo: "texto" | "numero" | "moeda";
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

/**
 * Tabela profissional com:
 * - Cabeçalho fixo (sticky) ao rolar a tabela
 * - Scroll vertical interno (max-h-[70vh])
 * - Botão "Colunas" com Popover+Checkbox para mostrar/ocultar colunas
 * - Toggle "Compacto" para densidade de texto
 * - Busca interna e ordenação por coluna
 * - Números e moeda alinhados à direita, tabular-nums
 */
export function DataTable<T extends Record<string, unknown>>({
  columns, rows, estado = "ok", onRetry, searchable = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [query, setQuery] = useState("");
  const [compacto, setCompacto] = useState(false);

  // Visibilidade de colunas: todas visíveis por default.
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(
    () => Object.fromEntries(columns.map((c) => [c.key, true])),
  );

  const colunasVisiveis = columns.filter((c) => visiveis[c.key]);

  function toggleColuna(key: string) {
    // Garante que pelo menos 1 coluna está visível
    const quantVisiveis = Object.values(visiveis).filter(Boolean).length;
    if (visiveis[key] && quantVisiveis <= 1) return;
    setVisiveis((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        if (c.tipo === "texto") return String(r[c.key] ?? "").toLowerCase().includes(q);
        return String(r[c.key] ?? "").includes(q);
      }),
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
      if (col?.tipo === "numero" || col?.tipo === "moeda") {
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
    <div className="flex flex-col gap-3 w-full">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <Input
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 max-w-xs text-sm"
          />
        )}

        {/* Seletor de colunas */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                aria-label="Gerenciar colunas visíveis"
              >
                <Columns2 className="size-3.5" aria-hidden />
                Colunas
              </Button>
            }
          />
          <PopoverContent className="w-52 p-2">
            <p className="mb-2 px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Colunas visíveis
            </p>
            <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {columns.map((c) => {
                const quantVisiveis = Object.values(visiveis).filter(Boolean).length;
                const isLast = visiveis[c.key] && quantVisiveis <= 1;
                return (
                  <li key={c.key}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted",
                        isLast && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={visiveis[c.key]}
                        onCheckedChange={() => toggleColuna(c.key)}
                        disabled={isLast}
                        aria-label={`Mostrar coluna ${c.header}`}
                      />
                      {c.header}
                    </label>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>

        {/* Toggle compacto */}
        <Button
          variant={compacto ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setCompacto((v) => !v)}
          aria-pressed={compacto}
          aria-label="Modo compacto"
        >
          <WrapText className="size-3.5" aria-hidden />
          Compacto
        </Button>

        {/* Contador de resultados */}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sorted.length} {sorted.length === 1 ? "linha" : "linhas"}
        </span>
      </div>

      {/* Tabela com scroll interno e cabeçalho sticky */}
      {/*
        Container ÚNICO de scroll (x e y). Não usamos o componente `Table`
        do design system aqui porque ele embrulha a tabela num `<div
        overflow-x-auto>` próprio — esse wrapper viraria o ancestral de
        scroll do `sticky` e o cabeçalho deixaria de travar. Com um único
        container, o `sticky top-0` do `<thead>` funciona de verdade.
      */}
      <div className="max-h-[70vh] w-full overflow-auto rounded-xl border border-border">
        <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-20 bg-muted backdrop-blur-sm">
              <TableRow>
                {colunasVisiveis.map((c) => {
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
                      className={cn(
                        (c.tipo === "numero" || c.tipo === "moeda") && "text-right",
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1 font-medium text-xs uppercase tracking-wide",
                          (c.tipo === "numero" || c.tipo === "moeda") && "ml-auto",
                        )}
                        aria-label={`Ordenar por ${c.header}`}
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.header}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="size-3.5 text-muted-foreground/50"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colunasVisiveis.length}>
                    <ChartEmpty />
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, i) => (
                  <TableRow
                    key={rowKey(row, i)}
                    className="transition-colors hover:bg-muted/50"
                  >
                    {colunasVisiveis.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          (c.tipo === "numero" || c.tipo === "moeda") &&
                            "tabular-nums text-right",
                          compacto && c.tipo === "texto" &&
                            "max-w-[200px] truncate",
                        )}
                        title={
                          compacto && c.tipo === "texto"
                            ? String(row[c.key] ?? "")
                            : undefined
                        }
                      >
                        {c.tipo === "numero"
                          ? formatNumber(Number(row[c.key] ?? 0), "decimal")
                          : c.tipo === "moeda"
                            ? formatNumber(Number(row[c.key] ?? 0), "moeda")
                            : String(row[c.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
        </table>
      </div>
    </div>
  );
}
