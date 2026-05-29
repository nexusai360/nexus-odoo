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
  toolsFilter: string[];
  pickedFilter: string[];
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

      {/* Zona de configuracao: parametros do router (tuning). A credencial de
          embedding foi movida para a tela de Configuracao do Agente Nex
          (R2-ctx), entao aqui fica so o bloco de Configuracao. */}
      <RouterControls
        initial={props.settings}
        eligibility={props.eligibility}
      />

      <RouterCalibrationButton />

      <RouterDecisionsTable
        rows={props.decisions}
        total={props.decisionsTotal}
        page={props.page}
        pageSize={props.pageSize}
        searchQuery={props.searchQuery}
        toolsFilter={props.toolsFilter}
        pickedFilter={props.pickedFilter}
      />
    </div>
  );
}
