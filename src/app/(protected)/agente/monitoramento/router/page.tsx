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
  getRouterDecisions,
  getRouterEligibleToActivate,
  getRouterEarliestDecision,
  type RouterFilter,
} from "@/lib/agent/router/queries";
import { getRouterSettings } from "@/lib/actions/router-settings";
import { getEmbeddingCredentialStatus } from "@/lib/actions/router-embedding-credential";
import { getPeriodInTz, type PeriodKey } from "@/lib/datetime-core";

const TZ = "America/Sao_Paulo";
const ROUTER_PAGE_SIZES = [50, 100, 500];
const DEFAULT_ROUTER_PAGE_SIZE = 50;
const VALID_PKS: PeriodKey[] = [
  "hoje",
  "semana_atual",
  "mes_atual",
  "todos",
  "custom",
];

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function resolveRange(
  pk: PeriodKey,
  cs: string | undefined,
  ce: string | undefined,
  minDate: Date,
): { start: Date; end: Date } {
  if (pk === "todos") return { start: minDate, end: new Date() };
  if (pk === "custom" && cs && ce) {
    const start = isoLocalToDate(cs);
    const end = isoLocalToDate(ce);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return getPeriodInTz(pk, TZ);
}

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
  searchParams: Promise<{
    pk?: string;
    cs?: string;
    ce?: string;
    modos?: string;
    page?: string;
    ps?: string;
    q?: string;
    tools?: string;
    picked?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const sp = await searchParams;
  const pk: PeriodKey = VALID_PKS.includes(sp.pk as PeriodKey)
    ? (sp.pk as PeriodKey)
    : "semana_atual";
  const modos = sp.modos
    ? sp.modos.split(",").filter(Boolean)
    : [];
  const page = Number(sp.page) >= 0 ? Math.floor(Number(sp.page)) : 0;
  const pageSize = ROUTER_PAGE_SIZES.includes(Number(sp.ps))
    ? Number(sp.ps)
    : DEFAULT_ROUTER_PAGE_SIZE;

  // minDate = primeira decisao registrada (para o "Personalizado" e "Tudo").
  const earliest = await getRouterEarliestDecision();
  const minDate =
    earliest ??
    // eslint-disable-next-line react-hooks/purity -- server component, hora atual e' esperada
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const range = resolveRange(pk, sp.cs, sp.ce, minDate);
  const q = sp.q ?? "";
  const tools = sp.tools ? sp.tools.split(",").filter(Boolean) : [];
  const picked = sp.picked ? sp.picked.split(",").filter(Boolean) : [];
  const filter: RouterFilter = {
    start: range.start,
    end: range.end,
    modes: modos.length > 0 ? modos : undefined,
    q: q || undefined,
    tools: tools.length > 0 ? tools : undefined,
    picked: picked.length > 0 ? picked : undefined,
  };

  const [
    kpis,
    buckets,
    latency,
    decisionsPage,
    settings,
    eligibility,
    embeddingCredential,
  ] = await Promise.all([
    getRouterKpis(filter),
    getRouterHistogram(filter),
    getRouterLatencyTimeseries(filter),
    getRouterDecisions(filter, page, pageSize),
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
      <div className="mt-6">
        <RouterFilters
          pk={pk}
          customStart={sp.cs}
          customEnd={sp.ce}
          modos={modos}
          minDateIso={minDate.toISOString()}
        />
      </div>
      <div className="mt-4">
        <RouterContent
          kpis={kpis}
          buckets={buckets}
          latency={latency}
          decisions={decisionsPage.rows}
          decisionsTotal={decisionsPage.total}
          page={page}
          pageSize={pageSize}
          searchQuery={q}
          toolsFilter={tools}
          pickedFilter={picked}
          settings={settings ?? DEFAULT_SETTINGS}
          eligibility={eligibility}
          embeddingCredential={embeddingCredential}
        />
      </div>
    </PageShell>
  );
}
