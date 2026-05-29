"use client";

/**
 * R1 router de catalogo: tabela de TODAS as decisoes do router no filtro atual
 * (nao so as discordancias). Padrao visual alinhado a tabela de avaliacoes do
 * Backtest: coluna "Data" com dia/mes/ano e HH:MM:SS, tags no mesmo estilo.
 * Linhas discordantes ganham um realce sutil. Paginacao via URL (?page).
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import type { RouterDecisionRow } from "@/lib/agent/router/queries";

// Dominios internos de encanamento (escape hatches sempre presentes no
// catalogo). Nao sao dominios de negocio, entao nao aparecem como tag.
const INTERNAL_DOMAINS = new Set(["caminho3", "dominios-vazios"]);

// Cores por dominio para a coluna "Tool chamada" (paleta do status, sem
// vermelho, que passaria sensacao de erro).
const DOMAIN_TONE: Record<string, string> = {
  estoque: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  financeiro:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  fiscal:
    "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
  comercial:
    "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  cadastros:
    "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300",
  contabil:
    "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  crm: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300",
};

function toneFor(domain: string): string {
  return (
    DOMAIN_TONE[domain] ??
    "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300"
  );
}

interface Props {
  rows: RouterDecisionRow[];
  total: number;
  page: number;
  pageSize: number;
}

// Mesmo formato da coluna Data da tabela de avaliacoes do Backtest.
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Tag da coluna "Router escolhida": mesmo estilo da coluna Origem do
 *  Backtest (outline muted font-mono). */
function PickedTag({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground"
    >
      {children}
    </Badge>
  );
}

/** Tag da coluna "Tool chamada": colorida por dominio (paleta de status). */
function ToolTag({ domain }: { domain: string }) {
  return (
    <Badge variant="outline" className={cn("border text-[11px]", toneFor(domain))}>
      {domain}
    </Badge>
  );
}

export function RouterDecisionsTable({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(Math.min(Math.max(0, next), totalPages - 1)));
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const startIdx = total === 0 ? 0 : page * pageSize + 1;
  const endIdx = Math.min((page + 1) * pageSize, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Requisições do router
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Todas as decisões no período e origem filtrados. Linhas em destaque
          são discordâncias (o domínio chamado/esperado ficou fora do que o
          router escolheu), candidatas a calibrar `domain-vocabulary.ts`.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma decisão registrada no filtro atual.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Data</TableHead>
                    <TableHead>Pergunta</TableHead>
                    <TableHead>Router escolhida</TableHead>
                    <TableHead>Tool chamada</TableHead>
                    <TableHead
                      className="w-[90px] text-right"
                      title="Confiança do match (0 a 1): similaridade entre a pergunta e o domínio top. Abaixo do corte vira fallback."
                    >
                      Score (confiança)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={cn(
                        r.discordante && "bg-amber-500/5",
                      )}
                    >
                      <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {r.discordante ? (
                            <AlertTriangle
                              className="h-3.5 w-3.5 text-amber-400"
                              aria-label="Discordância"
                            />
                          ) : null}
                          {dateTimeFmt.format(r.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm">
                        {r.userQuestion}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            const visible = r.pickedDomains.filter(
                              (d) => !INTERNAL_DOMAINS.has(d),
                            );
                            if (visible.length === 0) {
                              return <PickedTag>fallback</PickedTag>;
                            }
                            return visible.map((d) => (
                              <PickedTag key={d}>{d}</PickedTag>
                            ));
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.toolsDomains.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          ) : (
                            r.toolsDomains.map((d, i) => (
                              <ToolTag key={`${r.id}-${i}-${d}`} domain={d} />
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.topScore !== null ? (
                          r.topScore.toFixed(2)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Paginacao */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3",
                pending && "opacity-70",
              )}
            >
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {startIdx}
                {"-"}
                {endIdx} de {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 0 || pending}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <PageJumpNavigator
                  page={page}
                  totalPages={totalPages}
                  onJump={goToPage}
                  disabled={pending}
                />
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages - 1 || pending}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
