"use client";

/**
 * RBAC v2 (Onda F): card de "Recusas por permissao" do Agente Nex.
 *
 * Mostra quantas perguntas o fast-path recusou (sem chamar o LLM) por cair em
 * dominio fora do acesso do usuario, agrupadas por dominio negado, mais as
 * recusas mais recentes. Dado vem do server via props
 * (getPermissionDenialStats). Visual reusa o design system dos paineis
 * /agente/router e /agente/monitoramento (Card, KPICard, InteractiveBarChart,
 * Table, Badge).
 */

import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/charts/kpi-card";
import { InteractiveBarChart } from "@/components/charts/interactive/bar-chart";
import { cn } from "@/lib/utils";
import type {
  DenialPeriod,
  PermissionDenialStats,
} from "@/lib/actions/agent-permission-denials";

interface Props {
  stats: PermissionDenialStats;
  period: DenialPeriod;
}

const PERIOD_LABELS: Record<DenialPeriod, string> = {
  "24h": "24h",
  "7d": "7 dias",
  "30d": "30 dias",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function PermissionDenialsCard({ stats, period }: Props) {
  const chartData = stats.byDomain.map((d) => ({
    name: d.label,
    recusas: d.count,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldOff className="h-4 w-4 text-red-400" />
              Recusas por permissao
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Perguntas que o Agente Nex recusou sem chamar o LLM por caírem em
              módulo fora do acesso do usuário.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
            {(Object.keys(PERIOD_LABELS) as DenialPeriod[]).map((p) => (
              <Link
                key={p}
                href={`?denialsPeriod=${p}`}
                scroll={false}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  p === period
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PERIOD_LABELS[p]}
              </Link>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stats.total === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma recusa no período. Ninguém esbarrou em módulo fora do seu
            acesso.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KPICard
                valor={stats.total}
                rotulo={`Recusas (${PERIOD_LABELS[period]})`}
                formato="inteiro"
                tone="danger"
                icone={ShieldOff}
              />
              <KPICard
                valor={stats.byDomain.length}
                rotulo="Módulos distintos negados"
                formato="inteiro"
                tone="warning"
              />
              <KPICard
                valor={stats.recent.length}
                rotulo="Usuários nas recusas recentes"
                formato="inteiro"
                tone="default"
                hint="amostra das 10 mais recentes"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Por módulo negado
              </p>
              <InteractiveBarChart
                data={chartData}
                series={[{ key: "recusas", label: "Recusas", color: "#f87171" }]}
                layout="horizontal"
                height={Math.max(160, chartData.length * 44)}
                showLegend={false}
                yAxisWidth={110}
                ariaLabel="Recusas de permissão por módulo"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recusas recentes
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Quando</TableHead>
                      <TableHead className="w-[160px]">Usuário</TableHead>
                      <TableHead>Pergunta</TableHead>
                      <TableHead>Módulos negados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent.map((r, i) => (
                      <TableRow key={`${r.userId ?? "anon"}-${i}`}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {dateFmt.format(r.timestamp)}
                        </TableCell>
                        <TableCell className="truncate text-sm">
                          {r.userName}
                        </TableCell>
                        <TableCell
                          className="max-w-[320px] truncate text-sm"
                          title={r.questionSnippet}
                        >
                          {r.questionSnippet || "(sem texto)"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.deniedDomains.map((d, j) => (
                              <Badge
                                key={`${i}-${j}-${d}`}
                                variant="destructive"
                              >
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
