"use client";

/**
 * R1 router de catalogo: KPI cards da aba /agente/router.
 *
 * Top-1 (verde quando >= 95%, meta de ativacao), Top-K mais restrito,
 * fallback %, latencia p95.
 */

import { Crosshair, Layers, Activity, Clock4 } from "lucide-react";
import { KpiCard } from "@/components/reports/kpi-card";
import type { RouterKpis } from "@/lib/agent/router/queries";
import { ROUTER_PROMOTION_MIN_TOP1_PCT } from "@/lib/agent/router/constants";

interface Props {
  kpis: RouterKpis;
}

export function RouterKpisBlock({ kpis }: Props) {
  const top1Tone =
    kpis.top1AccPct >= ROUTER_PROMOTION_MIN_TOP1_PCT
      ? "success"
      : kpis.top1AccPct >= 70
        ? "warning"
        : "danger";
  const latP95Tone =
    kpis.latencyP95Ms <= 200
      ? "success"
      : kpis.latencyP95Ms <= 350
        ? "warning"
        : "danger";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        icon={Crosshair}
        label="Top-1 acerto"
        value={`${kpis.top1AccPct.toFixed(1)}%`}
        hint={`em ${kpis.totalDecisoes} decisoes`}
        tone={top1Tone}
      />
      <KpiCard
        icon={Layers}
        label="Top-K (todas)"
        value={`${kpis.allInTopKPct.toFixed(1)}%`}
        hint="todas as tools no top-K"
        tone="default"
      />
      <KpiCard
        icon={Activity}
        label="Fallback"
        value={`${kpis.fallbackPct.toFixed(1)}%`}
        hint={`${kpis.fallbackCount} turnos com catalogo inteiro`}
        tone="default"
      />
      <KpiCard
        icon={Clock4}
        label="Latencia p95"
        value={`${kpis.latencyP95Ms}ms`}
        hint={`p50 ${kpis.latencyP50Ms}ms · p99 ${kpis.latencyP99Ms}ms`}
        tone={latP95Tone}
      />
    </div>
  );
}
