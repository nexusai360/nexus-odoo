"use client";

/**
 * ChartsBlock , 3 charts lado a lado no dashboard /agente/qualidade:
 *   1. % CORRETO por dia (linha/area)
 *   2. Distribuicao de status (donut)
 *   3. Top 10 padroes (barra horizontal)
 *
 * Cores semanticas alinhadas com KPIs: CORRETO emerald, PARCIAL amber,
 * ERRADO red, FORA_DO_ESCOPO slate.
 */

import { Activity, ChartPie, BarChart3 } from "lucide-react";

import {
  DonutWithCenter,
  InteractiveAreaChart,
  InteractiveBarChart,
} from "@/components/charts/interactive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QualityKpisV2 } from "@/lib/agent/quality/queries";

const STATUS_COLOR: Record<
  "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DO_ESCOPO",
  string
> = {
  CORRETO: "#10b981",       // emerald-500
  PARCIAL: "#f59e0b",       // amber-500
  ERRADO: "#ef4444",        // red-500
  FORA_DO_ESCOPO: "#94a3b8", // slate-400
};

const numberFmt = new Intl.NumberFormat("pt-BR");
const formatNumber = (v: number) => numberFmt.format(v);
const formatPercent = (v: number) =>
  Number.isFinite(v) ? `${v.toFixed(1)}%` : "0%";

interface ChartsBlockProps {
  dailyData: Array<{
    date: string;
    percent: number | null;
    total: number;
    marker?: string | null;
  }>;
  kpis: QualityKpisV2;
  topPatterns: Array<{ pattern: string; count: number }>;
  loading?: boolean;
  /** Fim do periodo selecionado (ISO). A serie diaria e' estendida (carry-
   *  forward) ate min(hoje BRT, fim do periodo), para mostrar o dia atual. */
  periodEnd: string;
  /** Resolve o nome da rodada a partir do marker (ex.: "Rodada 24"). */
  labelForRodada?: (marker: string | null | undefined) => string;
}

/** Chave YYYY-MM-DD em America/Sao_Paulo (en-CA = ISO). */
function dayKeyBrt(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Soma N dias a uma chave YYYY-MM-DD (em UTC, evita drift de fuso). */
function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Constroi a serie diaria CONTINUA (um ponto por dia de calendario) do 1o dia
 * com avaliacao ate `untilKey` (hoje, em BRT), aplicando carry-forward: dias
 * SEM teste herdam o ultimo percentual conhecido em vez de cair para 0. Assim:
 *  - um unico dia de teste vira uma LINHA ate hoje (nao um ponto isolado);
 *  - o dia atual reflete o ultimo aproveitamento ("ainda em 100%").
 * Dias antes do 1o percentual conhecido ficam null (sem ponto).
 */
export function fillForwardDaily(
  rows: Array<{
    date: string;
    percent: number | null;
    total: number;
    marker?: string | null;
  }>,
  untilKey?: string,
): Array<{
  date: string;
  percent: number | null;
  total: number;
  marker: string | null;
  carriedForward: boolean;
}> {
  if (rows.length === 0) return [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const startKey = rows[0].date;
  const lastRowKey = rows[rows.length - 1].date;
  const endKey =
    untilKey && untilKey > lastRowKey ? untilKey : lastRowKey;

  const out: Array<{
    date: string;
    percent: number | null;
    total: number;
    marker: string | null;
    carriedForward: boolean;
  }> = [];
  let last: number | null = null;
  for (let key = startKey; key <= endKey; key = addDayKey(key, 1)) {
    const row = byDate.get(key);
    const temTeste = !!row && row.total > 0 && row.percent !== null;
    if (temTeste) {
      last = row!.percent;
      out.push({
        date: key,
        percent: row!.percent,
        total: row!.total,
        marker: row!.marker ?? null,
        carriedForward: false,
      });
    } else {
      out.push({
        date: key,
        percent: last,
        total: row?.total ?? 0,
        marker: null,
        carriedForward: last !== null,
      });
    }
  }
  return out;
}

export function ChartsBlock({
  dailyData,
  kpis,
  topPatterns,
  loading = false,
  periodEnd,
  labelForRodada,
}: ChartsBlockProps) {
  // Estende a serie ate min(hoje, fim do periodo) em BRT (carry-forward).
  const todayKey = dayKeyBrt(new Date());
  const periodEndKey = dayKeyBrt(new Date(periodEnd));
  const untilKey = periodEndKey < todayKey ? periodEndKey : todayKey;
  const filledDaily = fillForwardDaily(dailyData, untilKey);
  const areaData = filledDaily
    // Pula dias iniciais sem percentual previo (linha so comeca no 1o teste).
    .filter((d) => d.percent !== null)
    .map((d) => ({
      name: formatDayLabel(d.date),
      tooltipLabel: d.date,
      // 2a linha do tooltip: rodada do dia ou aviso de dia sem rodada.
      tooltipFooter:
        !d.carriedForward && d.marker
          ? labelForRodada
            ? labelForRodada(d.marker)
            : d.marker
          : "Não houve rodada",
      "% Correto": d.percent ?? 0,
    }));

  const donutData = [
    { name: "CORRETO", value: kpis.corretos, color: STATUS_COLOR.CORRETO },
    { name: "PARCIAL", value: kpis.parciais, color: STATUS_COLOR.PARCIAL },
    { name: "ERRADO", value: kpis.errados, color: STATUS_COLOR.ERRADO },
    {
      name: "FORA_DO_ESCOPO",
      value: kpis.foraDoEscopo,
      color: STATUS_COLOR.FORA_DO_ESCOPO,
    },
  ];

  const patternBarData = topPatterns.map((p) => ({
    name: p.pattern,
    Ocorrências: p.count,
  }));

  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      aria-busy={loading ? "true" : "false"}
    >
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-violet-500" />
            % Correto por dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InteractiveAreaChart
            data={areaData}
            series={[
              {
                key: "% Correto",
                label: "% Correto",
                color: STATUS_COLOR.CORRETO,
              },
            ]}
            height={420}
            formatValue={formatPercent}
            xAxisLeftPadding={16}
            ariaLabel="Percentual de respostas corretas por dia"
            emptyMessage="Sem avaliações no período"
            emptyHint="Aguarde novas conversas serem avaliadas."
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ChartPie className="h-4 w-4 text-violet-500" />
            Distribuição de status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DonutWithCenter
              data={donutData}
              height={420}
              centerLabel="Total avaliado"
              centerValue={numberFmt.format(kpis.totalAvaliado)}
              formatValue={formatNumber}
              showPercentInTooltip
              ariaLabel="Distribuição de avaliações por status"
              emptyMessage="Sem avaliações no período"
            />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Top 10 padrões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InteractiveBarChart
            data={patternBarData}
            series={[
              {
                key: "Ocorrências",
                label: "Ocorrências",
                color: "#8b5cf6", // violet-500
              },
            ]}
            height={420}
            layout="horizontal"
            yAxisWidth={200}
            formatValue={formatNumber}
            showLegend={false}
            ariaLabel="Top 10 padrões diagnósticos mais frequentes"
            emptyMessage="Sem padrões registrados"
            emptyHint="Padrões aparecem após auditar conversas."
          />
        </CardContent>
      </Card>
    </div>
  );
}
