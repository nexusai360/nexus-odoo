"use client";

/**
 * R1 router de catalogo: tabela de TODAS as decisoes do router no filtro atual
 * (nao so as discordancias). Padrao visual alinhado a tabela de avaliacoes do
 * Backtest: coluna "Data" com dia/mes/ano e HH:MM:SS, tags no mesmo estilo.
 * Linhas discordantes ganham um realce sutil. Paginacao via URL (?page).
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

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
import { CustomSelect } from "@/components/ui/custom-select";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import type { RouterDecisionRow } from "@/lib/agent/router/queries";

// Rotas internas (sempre presentes no catalogo) ganham nome amigavel em vez
// de serem escondidas: sao rotas de verdade, so tinham nome tecnico.
const DOMAIN_DISPLAY: Record<string, string> = {
  caminho3: "BI avançado",
  "dominios-vazios": "cobertura",
};
function displayDomain(d: string): string {
  return DOMAIN_DISPLAY[d] ?? d;
}

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
  searchQuery: string;
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
      {DOMAIN_DISPLAY[domain] ?? domain}
    </Badge>
  );
}

export function RouterDecisionsTable({
  rows,
  total,
  page,
  pageSize,
  searchQuery,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchQuery);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applySearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    params.set("page", "0");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(Math.min(Math.max(0, next), totalPages - 1)));
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const changePageSize = (nextSize: number) => {
    // Ancora na 1a linha atual (nao volta pra pagina 1 ao mudar o tamanho).
    const firstRow = page * pageSize;
    const params = new URLSearchParams(searchParams.toString());
    params.set("ps", String(nextSize));
    params.set("page", String(Math.floor(firstRow / nextSize)));
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
          Requisições do Router
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Todas as decisões no período e origem filtrados. Linhas em destaque
          são discordâncias (o domínio chamado/esperado ficou fora do que o
          router escolheu), candidatas a calibrar `domain-vocabulary.ts`.
        </p>
        <div className="mt-2 flex max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Busca avançada…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch(search);
              }}
              className="pl-8"
              aria-label="Buscar na pergunta"
            />
          </div>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                applySearch("");
              }}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpar
            </button>
          ) : null}
        </div>
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
                      className="w-[110px] text-right"
                      title="Similaridade (cosseno) entre a pergunta e o domínio mais próximo. Neste modelo de embedding, 0,40-0,60 já é um bom match (raramente passa de 0,7). O acerto alto vem do ranking relativo (o domínio certo é o mais próximo) e das regras de palavra-chave, não do valor absoluto."
                    >
                      Similaridade
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
                      <TableCell className="font-mono text-xs whitespace-nowrap">
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
                      <TableCell
                        className="max-w-[320px] truncate text-sm"
                        title={r.userQuestion}
                      >
                        {r.userQuestion}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.pickedDomains.length === 0 ? (
                            <PickedTag>fallback</PickedTag>
                          ) : (
                            r.pickedDomains.map((d) => (
                              <PickedTag key={d}>{displayDomain(d)}</PickedTag>
                            ))
                          )}
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
                "grid grid-cols-1 items-center gap-3 border-t border-border px-4 py-3 sm:grid-cols-3",
                pending && "opacity-70",
              )}
            >
              <p className="text-xs text-muted-foreground tabular-nums justify-self-start">
                Mostrando {startIdx}
                {"-"}
                {endIdx} de {total}
              </p>
              <div className="flex items-center justify-center gap-2">
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
              <div className="justify-self-end">
                <CustomSelect
                  value={String(pageSize)}
                  onChange={(v) => changePageSize(Number(v))}
                  options={[50, 100, 500].map((n) => ({
                    value: String(n),
                    label: `${n} por página`,
                  }))}
                  triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
                  aria-label="Itens por página"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
