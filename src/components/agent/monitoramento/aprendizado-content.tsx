/**
 * B3. Conteúdo da aba Aprendizado. Read-only, server component: matriz de
 * concordância Avaliação × Perícia, KPIs, discordâncias priorizadas e padrões
 * de erro + comentários negativos (matéria-prima de correção). Deep-link pro
 * Backtest (?eval=) reusa a Fatia 4.
 */

import Link from "next/link";
import { ArrowUpRight, ScanSearch } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EvalStatusBadge } from "@/components/agent/quality/eval-status-badge";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import { RATING_META } from "@/components/agent/rating-meta";
import { BUCKETS, type Bucket, type Matrix } from "@/lib/actions/aprendizado-helpers";
import type { AprendizadoOverview } from "@/lib/actions/aprendizado";
import { cn } from "@/lib/utils";

function RatingTag({ bucket }: { bucket: Bucket }) {
  const meta = RATING_META[bucket];
  const Icon = meta.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ background: meta.color }}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function ConcordanceMatrix({ matrix }: { matrix: Matrix }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left text-[11px] font-medium text-muted-foreground">
              Avaliação ↓ / Perícia →
            </th>
            {BUCKETS.map((j) => (
              <th key={j} className="p-1">
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: RATING_META[j].color }}
                >
                  {RATING_META[j].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BUCKETS.map((u) => (
            <tr key={u}>
              <th className="p-1 text-left">
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: RATING_META[u].color }}
                >
                  {RATING_META[u].label}
                </span>
              </th>
              {BUCKETS.map((j) => {
                const v = matrix[u][j];
                const agree = u === j;
                return (
                  <td
                    key={j}
                    className={cn(
                      "rounded-md p-2 tabular-nums",
                      v === 0
                        ? "bg-muted/30 text-muted-foreground/40"
                        : agree
                          ? "bg-emerald-500/15 font-bold text-emerald-300"
                          : "bg-amber-500/10 font-semibold text-amber-200",
                    )}
                    title={
                      agree
                        ? `Concordam: ${RATING_META[u].label}`
                        : `Usuário ${RATING_META[u].label} × Perícia ${RATING_META[j].label}`
                    }
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Diagonal (verde) = concordância; fora da diagonal (âmbar) = discordância.
      </p>
    </div>
  );
}

function truncate(text: string | null, max = 120): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function BacktestLink({ evaluationId }: { evaluationId: string | null }) {
  if (!evaluationId) return null;
  return (
    <Link
      href={`/agente/monitoramento?eval=${evaluationId}`}
      title="Ver esta avaliação no Backtest"
      className="inline-flex items-center gap-0.5 text-xs font-medium text-violet-300 transition-colors hover:text-violet-200"
    >
      Backtest <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

export function AprendizadoContent({ overview }: { overview: AprendizadoOverview }) {
  const {
    matrix,
    agreementPct,
    crossed,
    disagreements,
    disagreementRows,
    errorPatterns,
    negativeComments,
  } = overview;

  const maxPattern = errorPatterns[0]?.count ?? 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Concordância"
          value={agreementPct === null ? "n/d" : `${agreementPct}%`}
          hint="usuário e plataforma no mesmo balde"
        />
        <Kpi label="Mensagens cruzadas" value={String(crossed)} hint="com voto e perícia" />
        <Kpi label="Discordâncias" value={String(disagreements)} hint="onde divergem" />
      </div>

      {/* Matriz */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Concordância: Avaliação × Perícia</CardTitle>
        </CardHeader>
        <CardContent>
          {crossed === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ainda não há mensagens com voto do usuário E perícia da plataforma.
            </p>
          ) : (
            <ConcordanceMatrix matrix={matrix} />
          )}
        </CardContent>
      </Card>

      {/* Discordâncias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Discordâncias priorizadas
            <span className="ml-2 font-normal text-muted-foreground">
              (juiz otimista demais primeiro)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {disagreementRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma discordância. Usuário e plataforma concordam em tudo que foi cruzado.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {disagreementRows.map((r) => (
                <li key={r.evaluationId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <RatingTag bucket={r.userRating} />
                    <span className="text-xs text-muted-foreground">×</span>
                    <EvalStatusBadge status={r.judgeStatus as EvalStatus} />
                    {r.model ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] text-muted-foreground"
                      >
                        {r.model}
                      </Badge>
                    ) : null}
                    <span className="ml-auto">
                      <BacktestLink evaluationId={r.evaluationId} />
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground [overflow-wrap:anywhere]">
                    {truncate(r.question) || (
                      <span className="text-muted-foreground">(sem pergunta)</span>
                    )}
                  </p>
                  {r.userComment ? (
                    <p className="mt-1 text-xs text-amber-200/90 [overflow-wrap:anywhere]">
                      <span className="font-semibold">Comentário do usuário:</span>{" "}
                      {r.userComment}
                    </p>
                  ) : null}
                  {r.razoes ? (
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      <span className="font-semibold">Perícia:</span> {truncate(r.razoes, 200)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Padrões de erro + comentários negativos */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ScanSearch className="h-4 w-4 text-muted-foreground" />
              Padrões de erro (perícia)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorPatterns.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum padrão de erro registrado.
              </p>
            ) : (
              <ul className="space-y-2">
                {errorPatterns.map((p) => (
                  <li key={p.pattern} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 truncate text-xs text-foreground" title={p.pattern}>
                      {p.pattern}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-red-500/70"
                        style={{ width: `${Math.round((100 * p.count) / maxPattern)}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                      {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Comentários do usuário (votos negativos)</CardTitle>
          </CardHeader>
          <CardContent>
            {negativeComments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sem comentários em votos negativos.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {negativeComments.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <RatingTag bucket={c.rating} />
                    <p className="flex-1 text-xs text-foreground [overflow-wrap:anywhere]">
                      {c.comment}
                    </p>
                    <BacktestLink evaluationId={c.evaluationId} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Autocorreção automática (gerar correções de código a partir destes sinais) é a
        próxima onda do Aprendizado, ainda em design.
      </p>
    </div>
  );
}
