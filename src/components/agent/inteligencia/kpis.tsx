/**
 * KPIs da Frente A (analise retrospectiva) , server component.
 */

import type { QualityKpis } from "@/lib/agent/intelligence/queries";

interface KpisProps {
  kpis: QualityKpis;
}

function fmtAvg(v: number | null): string {
  if (v == null) return ",";
  return v.toFixed(1);
}

function bar(width: number): string {
  const pct = Math.max(2, Math.min(100, width));
  return `${pct}%`;
}

export function QualityKpisBlock({ kpis }: KpisProps) {
  const total = kpis.total;
  const coverageFactualPct =
    total === 0 ? 0 : Math.round((kpis.coverage.withFactual / total) * 100);
  const maxBucket = Math.max(
    1,
    ...Object.values(kpis.distribution),
  );

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard label="Avaliacoes" value={total.toString()} />
        <KpiCard label="Aderencia media" value={fmtAvg(kpis.avg.aderencia)} hint="1 = ruim · 5 = excelente" />
        <KpiCard label="Correcao factual" value={fmtAvg(kpis.avg.correcaoFactual)} hint="apenas turnos pos-instrumentacao" />
        <KpiCard label="Escolha de tools" value={fmtAvg(kpis.avg.escolhaDeTools)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Distribuicao de aderencia (1-5)
          </h3>
          <ul className="space-y-2">
            {[5, 4, 3, 2, 1].map((score) => {
              const n = kpis.distribution[score as 1 | 2 | 3 | 4 | 5];
              const pct = total === 0 ? 0 : (n / total) * 100;
              return (
                <li key={score} className="flex items-center gap-2 text-sm">
                  <span className="w-3 text-zinc-500">{score}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div
                      className="h-2 rounded-full bg-violet-500"
                      style={{ width: bar((n / maxBucket) * 100) }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-zinc-500">
                    {n} ({pct.toFixed(0)}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Cobertura por era
          </h3>
          <div className="space-y-3 text-sm">
            <CoverageRow
              label="Com correcao factual (pos-instrumentacao)"
              count={kpis.coverage.withFactual}
              pct={coverageFactualPct}
              color="bg-emerald-500"
            />
            <CoverageRow
              label="Sem correcao factual (pre-instrumentacao)"
              count={kpis.coverage.withoutFactual}
              pct={100 - coverageFactualPct}
              color="bg-amber-500"
            />
            <p className="pt-2 text-xs text-zinc-500">
              Turnos pre-instrumentacao nao tem tool_results gravados. O juiz
              avalia apenas 3 dimensoes (sem correcao factual).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function CoverageRow({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-500">
          {count} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
