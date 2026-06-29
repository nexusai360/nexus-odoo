"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns2, WrapText, ChevronLeft, ChevronRight, Download } from "lucide-react";
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
import {
  sortRows, filterRows, toggleSortStack, type SortEntry,
} from "./data-table-utils";
import { gerarCsv, downloadCsv } from "./export-csv";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import type { ReactNode } from "react";

export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  /**
   * - `tag`: 1 pílula colorida (valor string).
   * - `tags`: VÁRIAS pílulas por célula (valor `string[]`), estilo Router.
   */
  tipo: "texto" | "numero" | "moeda" | "percentual" | "tag" | "tags";
  /**
   * Para `tipo: "tag"|"tags"`: mapa valor->classe Tailwind do badge. O valor sem
   * mapa cai numa cor neutra. Ex.: `{ Atrasado: "bg-rose-500/10 text-rose-400" }`.
   */
  tagCores?: Record<string, string>;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  estado?: ChartState;
  onRetry?: () => void;
  searchable?: boolean;
  /**
   * Quando fornecida, cada linha exibe um chevron à esquerda; clicar na linha
   * expande um `<tr>` de detalhe com o conteúdo retornado. Retornar `null`
   * desabilita a expansão para aquela linha.
   */
  expandDetail?: (row: T) => ReactNode | null;
  /**
   * Nome base do arquivo CSV exportado (sem extensão).
   * Default: "relatorio"
   */
  exportFilename?: string;
  /**
   * Inicia em modo compacto (trunca colunas de texto longas, revelando as
   * colunas numéricas à direita sem scroll). Default: false.
   */
  compactoInicial?: boolean;
  /**
   * Quando true, a tabela preenche a altura do contêiner pai (flex) e rola
   * internamente, mantendo o cabeçalho fixo. Use dentro de blocos de altura
   * fixa (construtor). Default: false (usa `max-h-[70vh]`, como nas telas).
   */
  alturaFluida?: boolean;
}

/**
 * Chave estável de linha: prefere um id explícito; cai para índice quando
 * nenhum id está presente. Evita que ordenar ou pesquisar reassocie o DOM
 * por posição.
 */
function rowKey(row: Record<string, unknown>, index: number): string | number {
  for (const k of ["produtoId", "odooId", "id", "saldoHojeId"]) {
    const v = row[k];
    if (typeof v === "number" || typeof v === "string") return `${k}:${v}`;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Indicador de multi-sort no cabeçalho
// ---------------------------------------------------------------------------

interface SortIconProps {
  dir: "asc" | "desc" | null;
  /** Posição na stack (1-based). Exibida quando há mais de 1 critério. */
  stackIndex?: number;
  /** Total de critérios na stack. */
  total: number;
}

function SortIcon({ dir, stackIndex, total }: SortIconProps) {
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 transition-opacity",
          dir === null ? "text-muted-foreground/50" : "text-primary",
        )}
      />
      {dir !== null && total > 1 && stackIndex != null ? (
        <span
          aria-hidden="true"
          className="rounded-full bg-primary/15 px-1 text-[9px] font-bold leading-tight text-primary tabular-nums"
        >
          {stackIndex}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * Tabela profissional com:
 * - Multi-sort (clique simples = substitui stack; Shift+clique = acumula)
 * - Busca em todas as colunas com debounce 250 ms
 * - Linhas expansíveis via prop `expandDetail`
 * - Exportação CSV (linhas/colunas visíveis com busca+sort aplicados)
 * - Seletor de colunas (Popover+Checkbox)
 * - Modo compacto
 * - Cabeçalho fixo (sticky) no scroll interno
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  estado = "ok",
  onRetry,
  searchable = false,
  expandDetail,
  exportFilename = "relatorio",
  compactoInicial = false,
  alturaFluida = false,
}: DataTableProps<T>) {
  // --- busca (debounced) ---
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 250);
  }, []);

  // --- multi-sort ---
  const [sortStack, setSortStack] = useState<SortEntry[]>([]);

  function handleHeaderClick(key: string, shiftKey: boolean) {
    setSortStack((prev) => toggleSortStack(prev, key, shiftKey));
  }

  // --- colunas visíveis ---
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(
    () => Object.fromEntries(columns.map((c) => [c.key, true])),
  );
  const colunasVisiveis = columns.filter((c) => visiveis[c.key]);

  function toggleColuna(key: string) {
    const quantVisiveis = Object.values(visiveis).filter(Boolean).length;
    if (visiveis[key] && quantVisiveis <= 1) return;
    setVisiveis((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // --- modo compacto ---
  const [compacto, setCompacto] = useState(compactoInicial);

  // --- paginação ---
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);

  // --- linhas expandidas ---
  const [expandedKeys, setExpandedKeys] = useState<Set<string | number>>(new Set());
  function toggleExpand(key: string | number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- pipeline: filtro → sort ---
  const filtered = useMemo(
    () => filterRows(rows, debouncedQuery),
    [rows, debouncedQuery],
  );

  const sorted = useMemo(
    () => sortRows(filtered, sortStack, columns),
    [filtered, sortStack, columns],
  );

  // --- paginação derivada ---
  const totalPaginas = Math.max(1, Math.ceil(sorted.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginadas = useMemo(
    () => sorted.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina),
    [sorted, paginaSegura, porPagina],
  );
  // Volta à primeira página quando busca/ordenação/dados/tamanho mudam.
  useEffect(() => {
    setPagina(1);
  }, [debouncedQuery, sortStack, rows, porPagina]);

  // --- exportação CSV ---
  function handleExport() {
    const csv = gerarCsv(colunasVisiveis, sorted);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `${exportFilename}-${today}`);
  }

  // --- estados de carregamento / erro / vazio ---
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

  const hasExpand = Boolean(expandDetail);

  return (
    <div className={cn("flex flex-col gap-3 w-full", alturaFluida && "h-full min-h-0")}>
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <Input
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-8 max-w-xs text-sm"
            data-table-search
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

        {/* Exportar CSV */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs cursor-pointer"
          onClick={handleExport}
          disabled={sorted.length === 0}
          aria-label="Exportar tabela como CSV"
          data-tour="export-btn"
        >
          <Download className="size-3.5" aria-hidden />
          Exportar
        </Button>

        {/* Contador de resultados */}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sorted.length} {sorted.length === 1 ? "linha" : "linhas"}
        </span>
      </div>

      {/* Tabela com scroll interno e cabeçalho sticky */}
      <div className={cn("w-full overflow-auto rounded-xl border border-border", alturaFluida ? "min-h-0 flex-1" : "max-h-[70vh]")}>
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-20 bg-muted backdrop-blur-sm">
            <TableRow>
              {/* Coluna do chevron de expansão */}
              {hasExpand && (
                <TableHead className="w-8 px-2" aria-label="Expandir" />
              )}
              {colunasVisiveis.map((c) => {
                const stackIdx = sortStack.findIndex((e) => e.key === c.key);
                const entry = stackIdx >= 0 ? sortStack[stackIdx] : null;
                const dir = entry?.dir ?? null;
                const ariaSort =
                  dir === "asc"
                    ? ("ascending" as const)
                    : dir === "desc"
                      ? ("descending" as const)
                      : ("none" as const);
                return (
                  <TableHead
                    key={c.key}
                    aria-sort={ariaSort}
                    className={cn(
                      (c.tipo === "numero" || c.tipo === "moeda" || c.tipo === "percentual") && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-1 font-medium text-xs uppercase tracking-wide cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm",
                        (c.tipo === "numero" || c.tipo === "moeda" || c.tipo === "percentual") && "ml-auto",
                      )}
                      aria-label={`Ordenar por ${c.header}`}
                      title="Clique para ordenar · Shift+Clique para multi-sort"
                      onClick={(e) => handleHeaderClick(c.key, e.shiftKey)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleHeaderClick(c.key, e.shiftKey);
                        }
                      }}
                    >
                      {c.header}
                      <SortIcon
                        dir={dir}
                        stackIndex={stackIdx >= 0 ? stackIdx + 1 : undefined}
                        total={sortStack.length}
                      />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunasVisiveis.length + (hasExpand ? 1 : 0)}>
                  <ChartEmpty />
                </TableCell>
              </TableRow>
            ) : (
              paginadas.map((row, i) => {
                const key = rowKey(row, i);
                const expanded = expandedKeys.has(key);
                const detailNode = expandDetail ? expandDetail(row) : null;
                const expandable = detailNode !== null;

                return (
                  <Fragment key={key}>
                    <TableRow
                      className={cn(
                        "transition-colors hover:bg-muted/50",
                        expandable && "cursor-pointer",
                        expanded && "bg-muted/40",
                      )}
                      onClick={
                        expandable ? () => toggleExpand(key) : undefined
                      }
                      aria-expanded={expandable ? expanded : undefined}
                    >
                      {/* Chevron de expansão */}
                      {hasExpand && (
                        <TableCell className="w-8 px-2 py-0">
                          {expandable ? (
                            <ChevronRight
                              aria-hidden="true"
                              className={cn(
                                "size-4 text-muted-foreground transition-transform duration-150",
                                expanded && "rotate-90 text-primary",
                              )}
                            />
                          ) : (
                            <span className="block size-4" aria-hidden="true" />
                          )}
                        </TableCell>
                      )}
                      {colunasVisiveis.map((c) => (
                        <TableCell
                          key={c.key}
                          className={cn(
                            (c.tipo === "numero" || c.tipo === "moeda" || c.tipo === "percentual") &&
                              "tabular-nums text-right",
                            compacto &&
                              c.tipo === "texto" &&
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
                              : c.tipo === "percentual"
                                ? `${Number(row[c.key] ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                                : c.tipo === "tag"
                                  ? (
                                      <span className={cn(
                                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border/60",
                                        c.tagCores?.[String(row[c.key] ?? "")] ?? "bg-muted text-muted-foreground",
                                      )}>
                                        {String(row[c.key] ?? "")}
                                      </span>
                                    )
                                  : c.tipo === "tags"
                                    ? (
                                        <div className="flex flex-wrap gap-1">
                                          {(Array.isArray(row[c.key]) ? (row[c.key] as unknown as string[]) : []).map((t, ti) => (
                                            <span key={`${t}-${ti}`} className={cn(
                                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border/60",
                                              c.tagCores?.[t] ?? "bg-muted text-muted-foreground",
                                            )}>
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                      )
                                    : String(row[c.key] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>

                    {/* Linha de detalhe expansível */}
                    {expanded && expandable && detailNode != null && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell
                          colSpan={colunasVisiveis.length + (hasExpand ? 1 : 0)}
                          className="p-0"
                        >
                          <div
                            role="region"
                            aria-label="Detalhes da linha"
                            className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
                          >
                            {detailNode}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      {/* Rodapé: contagem de registros + paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {sorted.length === 0
            ? "Nenhum registro"
            : `${(paginaSegura - 1) * porPagina + 1} a ${Math.min(paginaSegura * porPagina, sorted.length)} de ${sorted.length} registros`}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Por página
            <select
              value={porPagina}
              onChange={(e) => setPorPagina(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
              aria-label="Registros por página"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Página anterior" disabled={paginaSegura <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <PageJumpNavigator
            page={paginaSegura - 1}
            totalPages={totalPaginas}
            onJump={(idx) => setPagina(idx + 1)}
            disabled={totalPaginas <= 1}
          />
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Próxima página" disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
