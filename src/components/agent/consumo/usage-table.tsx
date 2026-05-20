"use client";

/**
 * UsageTable — tabela paginada de chamadas de LLM.
 *
 * Task 5.2c (Onda 5, F5).
 * Portado de nexus-insights/src/components/llm/consumo-content.tsx (seção tabela).
 *
 * Badges:
 * - Origem: Playground (amber) | Chat (violet) — BUG 7 (isPlayground no schema).
 * - "Preço desconhecido" (amber): costKnown=false — BUG 2.
 * - "Cotação desatualizada" (amber): rateStale=true — BUG 5.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/custom-select";
import { UsageTableFilters } from "./usage-table-filters";
import { UsageDetail } from "./usage-detail";
import { fetchUsageDetails, fetchDistinctModels } from "@/lib/actions/llm-usage";
import type { UsageDetailRow, UsageDetailsTotals } from "@/lib/agent/llm/usage-stats";

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const numberFmt = new Intl.NumberFormat("pt-BR");

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return usdFmt.format(v);
}

function fmtBrl(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return brlFmt.format(v);
}

function providerLabel(key: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    openrouter: "OpenRouter",
  };
  return labels[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UsageTableProps {
  /** ISO string */
  rangeStart: string;
  /** ISO string */
  rangeEnd: string;
  globalProvider: string | undefined;
  isPlayground: boolean | null;
  providers: string[];
  modelsByProvider: Record<string, string[]>;
  onFetchModels: (provider: string | undefined, start: string, end: string) => Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function UsageTable({
  rangeStart,
  rangeEnd,
  globalProvider,
  isPlayground,
  providers,
  modelsByProvider,
  onFetchModels: _onFetchModels,
}: UsageTableProps) {
  const [filterProvider, setFilterProvider] = useState<string | undefined>(globalProvider);
  const [filterModel, setFilterModel] = useState<string | undefined>();
  const [localModelsByProvider, setLocalModelsByProvider] = useState<Record<string, string[]>>(modelsByProvider);

  const [rows, setRows] = useState<UsageDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<UsageDetailsTotals | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<UsageDetailRow | null>(null);

  // Sync globalProvider → filterProvider
  useEffect(() => {
    setFilterProvider(globalProvider);
    setFilterModel(undefined);
  }, [globalProvider]);

  // Reset página ao mudar filtros
  useEffect(() => {
    setPage(0);
  }, [rangeStart, rangeEnd, filterProvider, filterModel, isPlayground, pageSize]);

  // Fetch modelos quando provider muda (cascade)
  useEffect(() => {
    if (providers.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        providers.map(async (p) => {
          const models = await fetchDistinctModels({ start: rangeStart, end: rangeEnd, provider: p });
          return [p, models] as const;
        }),
      );
      if (!cancelled) {
        const map: Record<string, string[]> = {};
        for (const [p, ms] of entries) map[p] = ms;
        setLocalModelsByProvider(map);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [providers, rangeStart, rangeEnd]);

  // Fetch de detalhes
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsLoading(true);

    const run = async () => {
      try {
        const result = await fetchUsageDetails({
          start: rangeStart,
          end: rangeEnd,
          limit: pageSize,
          offset: page * pageSize,
          provider: filterProvider ?? null,
          model: filterModel ?? null,
          isPlayground,
        });
        if (!cancelled) {
          setRows(result.rows);
          setTotal(result.total);
          setTotals(result.totals);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar histórico.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, page, pageSize, filterProvider, filterModel, isPlayground]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStartIdx = total === 0 ? 0 : page * pageSize + 1;
  const rangeEndIdx = Math.min((page + 1) * pageSize, total);

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    setDetailRow(null);
  }, []);

  return (
    <>
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-violet-500" aria-hidden />
            Histórico de chamadas
          </CardTitle>
          <UsageTableFilters
            providers={providers}
            modelsByProvider={localModelsByProvider}
            selectedProvider={filterProvider}
            selectedModel={filterModel}
            onProviderChange={(p) => { setFilterProvider(p); setFilterModel(undefined); }}
            onModelChange={setFilterModel}
          />
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="hidden md:table-cell">Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tokens entrada</TableHead>
                  <TableHead className="text-right">Tokens saída</TableHead>
                  <TableHead className="text-right">Custo USD</TableHead>
                  <TableHead className="text-right">Custo BRL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha de total */}
                {totals && totals.count > 0 ? (
                  <TableRow className="sticky top-0 z-[1] bg-violet-500/5 dark:bg-violet-500/10 border-b border-border/60 font-bold text-sm">
                    <TableCell colSpan={5} className="whitespace-nowrap">
                      Total no filtro
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(totals.tokensInput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(totals.tokensOutput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(totals.costUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBrl(totals.costBrl)}
                    </TableCell>
                  </TableRow>
                ) : null}

                {/* Dados */}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando…
                        </span>
                      ) : "Nenhuma chamada no período."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const isWhisper = /whisper/i.test(row.model);
                    return (
                      <TableRow
                        key={row.id}
                        className="group cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => setDetailRow(row)}
                      >
                        <TableCell className="relative whitespace-nowrap tabular-nums pl-7 text-xs">
                          <ChevronRight
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60"
                            aria-hidden
                          />
                          {dateTimeFmt.format(new Date(row.createdAt))}
                        </TableCell>

                        {/* Badge de origem — BUG 7: isPlayground no schema */}
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            row.isPlayground
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                          )}>
                            {row.isPlayground ? "Playground" : "Agente Nex"}
                          </span>
                        </TableCell>

                        <TableCell className="text-sm">{providerLabel(row.provider)}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs">{row.model}</TableCell>

                        {/* Tipo da requisição — Task G11 */}
                        <TableCell>
                          {(() => {
                            const k = row.requestKind || "texto";
                            const styles: Record<string, string> = {
                              texto: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
                              imagem: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                              audio: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                              arquivo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                            };
                            const labels: Record<string, string> = {
                              texto: "Texto",
                              imagem: "Imagem",
                              audio: "Áudio",
                              arquivo: "Arquivo",
                            };
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  styles[k] ?? styles.texto,
                                )}
                              >
                                {labels[k] ?? "Texto"}
                              </span>
                            );
                          })()}
                        </TableCell>

                        <TableCell className={cn("text-right tabular-nums text-xs", isWhisper && "text-muted-foreground")}>
                          {isWhisper ? "—" : numberFmt.format(row.tokensInput)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums text-xs", isWhisper && "text-muted-foreground")}>
                          {isWhisper ? "—" : numberFmt.format(row.tokensOutput)}
                        </TableCell>

                        {/* Custo USD — BUG 2: badge preço desconhecido */}
                        <TableCell className="text-right tabular-nums text-xs">
                          {!row.costKnown ? (
                            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              preço desconhecido
                            </span>
                          ) : fmtUsd(row.costUsd)}
                        </TableCell>

                        {/* Custo BRL — BUG 5: indicador rateStale */}
                        <TableCell className="text-right tabular-nums text-xs">
                          {!row.costKnown ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="flex flex-col items-end gap-0.5">
                              <span>{fmtBrl(row.costBrl)}</span>
                              {row.rateStale && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400">
                                  cotação desatualizada
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {total > 0 ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {numberFmt.format(rangeStartIdx)}–{numberFmt.format(rangeEndIdx)} de {numberFmt.format(total)}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={() => handlePageChange(Math.max(0, page - 1))}
                  disabled={page === 0 || isLoading}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Página {page + 1} de {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1 || isLoading}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="inline-flex items-center text-xs text-muted-foreground">
                <CustomSelect
                  aria-label="Itens por página"
                  value={String(pageSize)}
                  onChange={(v) => {
                    const next = Number(v) as PageSize;
                    if (PAGE_SIZE_OPTIONS.includes(next)) setPageSize(next);
                  }}
                  triggerClassName="h-9 min-w-[150px]"
                  options={PAGE_SIZE_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `${n} por página`,
                  }))}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Drill-down */}
      <UsageDetail
        row={detailRow}
        open={detailRow !== null}
        onOpenChange={(open) => { if (!open) setDetailRow(null); }}
      />
    </>
  );
}
