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

export default async function MonitoramentoRouterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [
    kpis,
    buckets,
    latency,
    discordancias,
    settings,
    eligibility,
  ] = await Promise.all([
    getRouterKpis(7),
    getRouterHistogram(7),
    getRouterLatencyTimeseries(7),
    getRouterDiscordancias(50, 14),
    getRouterSettings(),
    getRouterEligibleToActivate(),
  ]);

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Activity}
        title="Monitoramento do Agente Nex"
        subtitle="Desempenho semântico das respostas por modelo e período. Avaliação on-demand via Claude Code."
      />
      <MonitoramentoNav />
      <div className="mt-6">
        <RouterContent
          kpis={kpis}
          buckets={buckets}
          latency={latency}
          discordancias={discordancias}
          settings={settings ?? DEFAULT_SETTINGS}
          eligibility={eligibility}
        />
      </div>
    </PageShell>
  );
}
