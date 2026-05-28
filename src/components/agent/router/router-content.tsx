"use client";

/**
 * R1 router de catalogo: wrapper de toda a pagina /agente/router.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.
 * Layout: KPIs em cima, charts em 2 colunas no meio, tabela de
 * discordancias e controles embaixo lado-a-lado.
 */

import { RouterKpisBlock } from "./router-kpis-block";
import { RouterHistogramChart } from "./router-histogram-chart";
import { RouterLatencyChart } from "./router-latency-chart";
import { RouterDiscordanciasTable } from "./router-discordancias-table";
import { RouterControls } from "./router-controls";
import type {
  RouterKpis,
  RouterHistogramBucket,
  RouterLatencyPoint,
  RouterDiscordanciaRow,
  RouterEligibility,
} from "@/lib/agent/router/queries";
import type { RouterSettingsSnapshot } from "@/lib/actions/router-settings";

interface Props {
  kpis: RouterKpis;
  buckets: RouterHistogramBucket[];
  latency: RouterLatencyPoint[];
  discordancias: RouterDiscordanciaRow[];
  settings: RouterSettingsSnapshot;
  eligibility: RouterEligibility;
}

export function RouterContent(props: Props) {
  return (
    <div className="space-y-6">
      <RouterKpisBlock kpis={props.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RouterHistogramChart buckets={props.buckets} />
        <RouterLatencyChart points={props.latency} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RouterDiscordanciasTable rows={props.discordancias} />
        </div>
        <RouterControls
          initial={props.settings}
          eligibility={props.eligibility}
        />
      </div>
    </div>
  );
}
