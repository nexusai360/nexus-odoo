"use client";

// src/components/reports/builder/report-data-table.tsx
// Tabela do construtor no MESMO padrao do "Historico de chamadas" do Consumo do
// Agente Nex: primitivas Table (ui/table), busca, numeros tabular-nums alinhados
// a direita, e rodape de paginacao de 3 zonas (Mostrando X-Y de Z | prev +
// PageJumpNavigator + next | CustomSelect de itens por pagina).
import * as React from "react";
import { Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import { formatNumber, type NumberFormat } from "@/components/charts/kpi-card";
import type { CampoTipo } from "@/lib/reports/builder/types";

export interface ColunaTabela {
  key: string;
  header: string;
  tipo?: CampoTipo;
}

const PAGE_SIZES = [10, 25, 50, 100] as const;

function formatoDoCampo(tipo: CampoTipo | undefined): NumberFormat {
  if (tipo === "moeda") return "moeda";
  if (tipo === "numero") return "inteiro";
  return "decimal";
}

function ehNumerico(tipo: CampoTipo | undefined): boolean {
  return tipo === "numero" || tipo === "moeda" || tipo === "percentual";
}

function celula(valor: unknown, tipo: CampoTipo | undefined): string {
  if (valor == null) return "-";
  if (ehNumerico(tipo) && typeof valor === "number") {
    if (tipo === "percentual") return `${formatNumber(valor, "decimal")}%`;
    return formatNumber(valor, formatoDoCampo(tipo));
  }
  if (typeof valor === "object") return "-";
  return String(valor);
}

/** Detalhe (drilldown) de uma linha: o array preservado em `__detalhe` pelo adaptador. */
function detalheDe(row: Record<string, unknown>): Record<string, unknown>[] | null {
  const d = row.__detalhe;
  return Array.isArray(d) && d.length > 0 ? (d as Record<string, unknown>[]) : null;
}

/** Sub-tabela do drilldown: colunas derivadas das chaves do 1o item do detalhe. */
function DetalheLinhas({ itens }: { itens: Record<string, unknown>[] }) {
  const cols = Object.keys(itens[0]);
  const fmt = new Intl.NumberFormat("pt-BR");
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 text-foreground/80 tabular-nums">
                  {typeof it[c] === "number" ? fmt.format(it[c] as number) : String(it[c] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportDataTable({
  columns,
  rows,
  searchable = true,
}: {
  columns: ColunaTabela[];
  rows: Record<string, unknown>[];
  searchable?: boolean;
}) {
  const [busca, setBusca] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<number>(25);
  const [aberta, setAberta] = React.useState<number | null>(null);

  // Filtra por texto em qualquer coluna (case/acento-insensitive simples).
  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, columns, busca]);

  const total = filtradas.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageClamped = Math.min(page, totalPages - 1);
  const inicio = pageClamped * pageSize;
  const visiveis = filtradas.slice(inicio, inicio + pageSize);
  const rangeStart = total === 0 ? 0 : inicio + 1;
  const rangeEnd = Math.min(inicio + pageSize, total);

  // Reseta a pagina ao mudar a busca.
  React.useEffect(() => setPage(0), [busca, pageSize]);

  const numberFmt = React.useMemo(() => new Intl.NumberFormat("pt-BR"), []);

  // Drilldown: ha alguma linha com detalhe aninhado? (decide a coluna do chevron)
  const algumDrill = React.useMemo(() => filtradas.some((r) => detalheDe(r) !== null), [filtradas]);
  const totalColunas = columns.length + (algumDrill ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar na tabela…"
            aria-label="Buscar na tabela"
            className="h-9 w-full rounded-lg border border-border bg-background py-1 pr-3 pl-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {algumDrill ? <TableHead className="w-9" /> : null}
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(ehNumerico(c.tipo) && "text-right")}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColunas} className="py-8 text-center text-sm text-muted-foreground">
                  {busca ? "Nenhum resultado para a busca." : "Sem dados para esta secao."}
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((row, i) => {
                const idxAbs = inicio + i;
                const detalhe = detalheDe(row);
                const expandida = aberta === idxAbs;
                return (
                  <React.Fragment key={idxAbs}>
                    <TableRow
                      className={cn("transition-colors hover:bg-muted/40", detalhe && "cursor-pointer")}
                      onClick={detalhe ? () => setAberta(expandida ? null : idxAbs) : undefined}
                      {...(detalhe
                        ? { role: "button", "aria-expanded": expandida, "aria-label": "Abrir detalhe da linha" }
                        : {})}
                    >
                      {algumDrill ? (
                        <TableCell className="w-9 text-muted-foreground">
                          {detalhe ? (
                            <ChevronDown
                              className={cn("h-4 w-4 transition-transform duration-200", expandida ? "rotate-0" : "-rotate-90")}
                              aria-hidden
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                      {columns.map((c) => (
                        <TableCell key={c.key} className={cn(ehNumerico(c.tipo) && "text-right tabular-nums")}>
                          {celula(row[c.key], c.tipo)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandida && detalhe ? (
                      <TableRow className="bg-muted/10 hover:bg-muted/10">
                        <TableCell colSpan={totalColunas} className="p-2">
                          <DetalheLinhas itens={detalhe} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 ? (
        <div className="mt-1 flex flex-col items-center justify-between gap-3 border-t border-border pt-3 sm:flex-row">
          <p className="text-xs text-muted-foreground tabular-nums">
            Mostrando {numberFmt.format(rangeStart)}
            {"-"}
            {numberFmt.format(rangeEnd)} de {numberFmt.format(total)}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Pagina anterior"
              onClick={() => setPage(Math.max(0, pageClamped - 1))}
              disabled={pageClamped === 0}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <PageJumpNavigator page={pageClamped} totalPages={totalPages} onJump={setPage} />
            <button
              type="button"
              aria-label="Proxima pagina"
              onClick={() => setPage(Math.min(totalPages - 1, pageClamped + 1))}
              disabled={pageClamped >= totalPages - 1}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="inline-flex items-center text-xs text-muted-foreground">
            <CustomSelect
              value={String(pageSize)}
              onChange={(v) => setPageSize(Number(v))}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} por pagina` }))}
              triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
              aria-label="Itens por pagina"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
