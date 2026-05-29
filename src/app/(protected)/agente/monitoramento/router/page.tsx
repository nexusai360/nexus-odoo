/**
 * /agente/monitoramento/router — aba Router do painel Monitoramento do
 * Agente Nex.
 *
 * Gate: super_admin (alinhado com /agente/monitoramento).
 * Server Component: busca KPIs/histograma/latencia/discordancias/settings/
 * elegibilidade em paralelo. Toda interatividade vive no RouterContent.
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md
 */

import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { RouterContent } from "@/components/agent/router/router-content";
import { RouterFilters } from "@/components/agent/router/router-filters";
import { MonitoramentoNav } from "@/components/agent/monitoramento-nav";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import {
  getRouterKpis,
  getRouterHistogram,
  getRouterLatencyTimeseries,
  getRouterDiscordancias,
  getRouterEligibleToActivate,
} from "@/lib/agent/router/queries";
import { getRouterSettings } from "@/lib/actions/router-settings";
import { getEmbeddingCredentialStatus } from "@/lib/actions/router-embedding-credential";

export const metadata = {
  title: "Monitoramento do Agente · Router | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = {
  routerEnabled: false,
  routerThreshold: 0.55,
  routerTopK: 3,
  routerRetryExpandBelow: 0.7,
  routerRetryEnabled: false,
};

export default async function MonitoramentoRouterPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; modo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const sp = await searchParams;
  const periodo = Number(sp.periodo) > 0 ? Number(sp.periodo) : 7;
  const modo = sp.modo ?? "todos";
  // "todos" -> sem filtro de modo (todas as origens). Caso contrario, restringe.
  const modes = modo === "todos" ? undefined : [modo];

  const [
    kpis,
    buckets,
    latency,
    discordancias,
    settings,
    eligibility,
    embeddingCredential,
  ] = await Promise.all([
    getRouterKpis(periodo, modes),
    getRouterHistogram(periodo, modes),
    getRouterLatencyTimeseries(periodo, modes),
    getRouterDiscordancias(50, periodo, modes),
    getRouterSettings(),
    getRouterEligibleToActivate(),
    getEmbeddingCredentialStatus(),
  ]);

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Activity}
        title="Monitoramento do Agente Nex"
        subtitle="Desempenho semântico das respostas por modelo e período. Avaliação on-demand via Claude Code."
      />
      <MonitoramentoNav />
      <div className="mt-6 flex justify-end">
        <RouterFilters periodo={String(periodo)} modo={modo} />
      </div>
      <div className="mt-4">
        <RouterContent
          kpis={kpis}
          buckets={buckets}
          latency={latency}
          discordancias={discordancias}
          settings={settings ?? DEFAULT_SETTINGS}
          eligibility={eligibility}
          embeddingCredential={embeddingCredential}
        />
      </div>
    </PageShell>
  );
}
