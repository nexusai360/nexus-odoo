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
import { RouterControls } from "./router-controls";
import { RouterEmbeddingCredential } from "./router-embedding-credential";
import { RouterCalibrationButton } from "./router-calibration-button";
import { RouterDecisionsTable } from "./router-decisions-table";
import type {
  RouterKpis,
  RouterHistogramBucket,
  RouterLatencyPoint,
  RouterDecisionRow,
  RouterEligibility,
} from "@/lib/agent/router/queries";
import type { RouterSettingsSnapshot } from "@/lib/actions/router-settings";
import type { EmbeddingCredentialStatus } from "@/lib/actions/router-embedding-credential";

interface Props {
  kpis: RouterKpis;
  buckets: RouterHistogramBucket[];
  latency: RouterLatencyPoint[];
  decisions: RouterDecisionRow[];
  decisionsTotal: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  settings: RouterSettingsSnapshot;
  eligibility: RouterEligibility;
  embeddingCredential: EmbeddingCredentialStatus;
}

export function RouterContent(props: Props) {
  return (
    <div className="space-y-6">
      <RouterKpisBlock kpis={props.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RouterHistogramChart buckets={props.buckets} />
        <RouterLatencyChart points={props.latency} />
      </div>

      {/* Zona de configuracao: credencial OpenAI e controles do router
          ficam juntos abaixo dos charts, separados das metricas. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RouterEmbeddingCredential initial={props.embeddingCredential} />
        <RouterControls
          initial={props.settings}
          eligibility={props.eligibility}
        />
      </div>

      <RouterCalibrationButton />

      <RouterDecisionsTable
        rows={props.decisions}
        total={props.decisionsTotal}
        page={props.page}
        pageSize={props.pageSize}
        searchQuery={props.searchQuery}
      />
    </div>
  );
}
