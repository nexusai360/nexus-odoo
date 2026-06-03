"use client";

/**
 * EvaluationsTable , tabela paginada de avaliacoes com filtros sticky e
 * drill-down inline. Padrao baseado em usage-table de /agente/consumo.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchQualityEvaluations,
  type FilterInputs,
} from "@/lib/actions/quality-fetch";
import type {
  EvalStatus,
  EvaluationRow,
} from "@/lib/agent/quality/queries";
import { cn } from "@/lib/utils";
import {
  channelToOrigem,
  markerToRodadaName,
} from "@/lib/agent/quality/rodada-labels";
import {
  EvaluationsTableFilters,
  type EvaluationsTableFiltersValue,
} from "./evaluations-table-filters";
import { EvaluationDrilldown } from "./evaluation-drilldown";

const PAGE_SIZE_OPTIONS = [50, 100, 500] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const STATUS_LABEL: Record<EvalStatus, string> = {
  CORRETO: "Correto",
  PARCIAL: "Parcial",
  ERRADO: "Errado",
  FORA_DO_ESCOPO: "Fora de escopo",
  PENDENTE: "Pendente",
  FALHA_TECNICA: "Falha técnica",
};

const STATUS_TONE: Record<EvalStatus, string> = {
  CORRETO:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  PARCIAL:
    "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  ERRADO: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
  FORA_DO_ESCOPO:
    "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  PENDENTE: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  FALHA_TECNICA:
    "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
};

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const numberFmt = new Intl.NumberFormat("pt-BR");

function truncate(text: string | null | undefined, max = 80): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

interface InitialData {
  rows: EvaluationRow[];
  total: number;
}

interface EvaluationsTableProps {
  initialData: InitialData;
  baseFilters: FilterInputs;
  availableModels: string[];
  availablePatterns: string[];
  /** Auto-numerador de rodadas (R8, R9, ...). Vindo do parent para
   * compartilhar a mesma instancia de Map entre seletores e tabela. */
  labelForRodada?: (marker: string | null | undefined) => string;
  /** Acao opcional renderizada a direita do titulo "Avaliacoes" (ex.: botao
   *  "Avaliar pendentes" em ambiente local). */
  headerAction?: React.ReactNode;
}

export function EvaluationsTable({
  initialData,
  baseFilters,
  availableModels,
  availablePatterns,
  labelForRodada,
  headerAction,
}: EvaluationsTableProps) {
  const [data, setData] = useState<InitialData>(initialData);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filters, setFilters] = useState<EvaluationsTableFiltersValue>({
    search: "",
    status: [],
    model: "all",
    pattern: "all",
  });

  // Quando o periodo/modelo do header muda, resetamos initialData via prop
  useEffect(() => {
    setData(initialData);
    setPage(1);
  }, [initialData]);

  const buildInputs = useCallback((): FilterInputs => {
    const inputs: FilterInputs = {
      ...baseFilters,
      status: filters.status.length > 0 ? filters.status : undefined,
      search: filters.search || undefined,
    };
    if (filters.model !== "all") {
      inputs.models = [filters.model];
    } else if (baseFilters.models) {
      inputs.models = baseFilters.models;
    }
    if (filters.pattern !== "all") {
      inputs.patterns = [filters.pattern];
    }
    return inputs;
  }, [baseFilters, filters]);

  const refetch = useCallback(
    async (nextPage: number, nextSize: PageSize) => {
      setLoading(true);
      try {
        const res = await fetchQualityEvaluations(buildInputs(), {
          page: nextPage,
          pageSize: nextSize,
        });
        setData(res);
      } finally {
        setLoading(false);
      }
    },
    [buildInputs],
  );

  // Re-fetch quando filtros locais mudam (debounce ja embutido em search)
  useEffect(() => {
    setPage(1);
    void refetch(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.status, filters.model, filters.pattern]);

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  const handlePage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    setPage(next);
    void refetch(next, pageSize);
  };

  const handlePageSize = (v: string) => {
    const next = Number.parseInt(v, 10) as PageSize;
    if (!PAGE_SIZE_OPTIONS.includes(next)) return;
    // Mantem a posicao: ancora na 1a linha atual (nao volta pra pagina 1).
    const firstRow = (page - 1) * pageSize;
    setPageSize(next);
    setPage(Math.floor(firstRow / next) + 1);
    void refetch(1, next);
  };

  const handleAdjusted = useCallback(() => {
    void refetch(page, pageSize);
  }, [page, pageSize, refetch]);

  const showingFrom = data.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, data.total);

  return (
    <Card className="overflow-hidden rounded-2xl border border-border bg-muted/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-violet-500" />
            Avaliações
            {loading && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-label="Carregando"
              />
            )}
          </CardTitle>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <EvaluationsTableFilters
          value={filters}
          onChange={setFilters}
          availableModels={availableModels}
          availablePatterns={availablePatterns}
        />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead className="w-[130px]">Origem</TableHead>
                <TableHead>Pergunta</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[140px]">Modelo</TableHead>
                <TableHead className="w-[180px]">Padrão dominante</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma avaliação encontrada com os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((row) => {
                const isOpen = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/40",
                        isOpen && "bg-muted/40",
                      )}
                      onClick={() => setExpandedId(isOpen ? null : row.id)}
                    >
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {dateTimeFmt.format(row.createdAt).replace(",", "")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          // Origem = rodada de auditoria (se conversa tem
                          // marker AUDIT-POS) OU virtual derivada do channel
                          // (in_app/whatsapp -> Agente Nex, playground ->
                          // Playground).
                          const origemMarker =
                            row.rodada ?? channelToOrigem(row.channel);
                          if (!origemMarker) {
                            return (
                              <span className="text-muted-foreground">,</span>
                            );
                          }
                          const label = labelForRodada
                            ? labelForRodada(origemMarker)
                            : markerToRodadaName(origemMarker);
                          return (
                            <Badge
                              variant="outline"
                              className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground"
                              title={origemMarker}
                            >
                              {label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate text-sm"
                        title={row.questionSnapshot ?? ""}
                      >
                        {truncate(row.questionSnapshot)}
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate text-sm"
                        title={row.answerSnapshot ?? ""}
                      >
                        {truncate(row.answerSnapshot)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border text-[11px]",
                              STATUS_TONE[row.status],
                            )}
                          >
                            {STATUS_LABEL[row.status]}
                          </Badge>
                          {row.humanStatus && (
                            <ShieldCheck
                              className="h-3 w-3 text-emerald-500"
                              aria-label="Ajustado manualmente"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.model ?? ","}
                      </TableCell>
                      <TableCell>
                        {row.dominantPattern ? (
                          <Badge variant="outline" className="text-[11px]">
                            {row.dominantPattern}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">,</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={isOpen ? "Fechar detalhes" : "Ver detalhes"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isOpen ? null : row.id);
                          }}
                        >
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/10">
                        {/* whitespace-normal: o td herda whitespace-nowrap do
                            TableCell; sem isso a resposta da IA nao quebra e
                            vaza pela direita do componente. */}
                        <TableCell colSpan={8} className="whitespace-normal p-0">
                          <EvaluationDrilldown
                            evaluationId={row.id}
                            onAdjusted={handleAdjusted}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Paginacao: 3 zonas (Mostrando | navegador centralizado | por pagina) */}
        <div className="grid grid-cols-1 items-center gap-3 border-t border-border px-4 py-3 text-xs sm:grid-cols-3">
          <div className="text-muted-foreground justify-self-start">
            Mostrando {numberFmt.format(showingFrom)}
            {"-"}
            {numberFmt.format(showingTo)} de {numberFmt.format(data.total)}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => handlePage(page - 1)}
              aria-label="Página anterior"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <PageJumpNavigator
              page={page - 1}
              totalPages={totalPages}
              onJump={(idx) => handlePage(idx + 1)}
              disabled={loading}
            />
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => handlePage(page + 1)}
              aria-label="Próxima página"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="justify-self-end">
            <CustomSelect
              value={String(pageSize)}
              onChange={handlePageSize}
              triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
              aria-label="Itens por página"
              options={PAGE_SIZE_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} por página`,
              }))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
