"use client";

/**
 * R1 router de catalogo: serie temporal de latencia p50/p95/p99 do
 * pickDomains nos ultimos 7 dias.
 *
 * Threshold de saude: p95 < 200ms (linha verde no badge dos KPIs).
 */

import { Activity } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InteractiveAreaChart } from "@/components/charts/interactive";
import type { RouterLatencyPoint } from "@/lib/agent/router/queries";

interface Props {
  points: RouterLatencyPoint[];
}

export function RouterLatencyChart({ points }: Props) {
  const mapped = points.map((p) => ({
    name: p.day,
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
  }));
  // Com um unico dia de dados, o recharts renderiza um ponto solto em vez de
  // linha. Prefixamos uma base em zero para a serie virar uma linha "do zero
  // ate o valor atual", evitando os pontinhos.
  const data =
    mapped.length === 1
      ? [{ name: "", p50: 0, p95: 0, p99: 0 }, ...mapped]
      : mapped;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-emerald-400" />
          Latencia pickDomains (ms)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InteractiveAreaChart
          data={data}
          series={[
            { key: "p50", label: "p50", color: "#10b981" },
            { key: "p95", label: "p95", color: "#f59e0b" },
            { key: "p99", label: "p99", color: "#ef4444" },
          ]}
          height={220}
          showLegend={true}
          showGrid={true}
          emptyMessage="Sem dados ainda"
          emptyHint="Latencia aparece apos o router rodar em algum turno."
          ariaLabel="Latencia do pickDomains em p50, p95 e p99 nos ultimos 7 dias"
        />
      </CardContent>
    </Card>
  );
}
