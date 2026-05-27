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
  Number.isFinite(v) ? `${v.toFixed(1)}%` : ",";

interface ChartsBlockProps {
  dailyData: Array<{ date: string; percent: number | null; total: number }>;
  kpis: QualityKpisV2;
  topPatterns: Array<{ pattern: string; count: number }>;
  loading?: boolean;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function ChartsBlock({
  dailyData,
  kpis,
  topPatterns,
  loading = false,
}: ChartsBlockProps) {
  const areaData = dailyData.map((d) => ({
    name: formatDayLabel(d.date),
    tooltipLabel: d.date,
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
            % CORRETO por dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InteractiveAreaChart
            data={areaData}
            series={[
              {
                key: "% Correto",
                label: "% CORRETO",
                color: STATUS_COLOR.CORRETO,
              },
            ]}
            height={260}
            formatValue={formatPercent}
            xAxisLeftPadding={16}
            ariaLabel="Percentual de respostas CORRETAS por dia"
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
            height={260}
            layout="horizontal"
            yAxisWidth={180}
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
