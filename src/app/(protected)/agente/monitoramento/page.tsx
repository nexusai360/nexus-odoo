/**
 * /agente/monitoramento , dashboard interno de monitoramento do Agente Nex.
 *
 * Gate: super_admin (layout do grupo /agente).
 * Server Component: busca a data minima (1ª eval registrada) e passa pro
 * client. Toda interatividade vive no MonitoramentoContent.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md
 */

import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { MonitoramentoContent } from "@/components/agent/monitoramento/monitoramento-content";
import { MonitoramentoNav } from "@/components/agent/monitoramento-nav";
import { PermissionDenialsCard } from "@/components/agent/router/permission-denials-card";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocalRuntime } from "@/lib/env-local";
import {
  getPermissionDenialStats,
  type DenialPeriod,
} from "@/lib/actions/agent-permission-denials";

const DENIAL_PERIODS: DenialPeriod[] = ["24h", "7d", "30d"];

function parseDenialPeriod(value: string | undefined): DenialPeriod {
  return DENIAL_PERIODS.includes(value as DenialPeriod)
    ? (value as DenialPeriod)
    : "7d";
}

export const metadata = {
  title: "Monitoramento do Agente | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

async function getFirstEvalDate(): Promise<Date> {
  const first = await prisma.conversationQualityEvaluation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (first?.createdAt) return first.createdAt;
  // Fallback: 90 dias atrás.
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
}

export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ denialsPeriod?: string; eval?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const sp = await searchParams;
  const denialPeriod = parseDenialPeriod(sp.denialsPeriod);
  const initialEvalId = typeof sp.eval === "string" ? sp.eval : undefined;

  const [minDate, agentSettings, denialStats] = await Promise.all([
    getFirstEvalDate(),
    prisma.agentSettings.findUnique({
      where: { id: "global" },
      select: { qualityHeuristicIntervalMinutes: true },
    }),
    getPermissionDenialStats(denialPeriod),
  ]);
  const qualityHeuristicIntervalMinutes =
    agentSettings?.qualityHeuristicIntervalMinutes ?? 240;

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Activity}
        title="Monitoramento do Agente Nex"
        subtitle="Desempenho semântico das respostas por modelo e período. Avaliação on-demand via Claude Code."
      />
      <MonitoramentoNav />
      <div className="mt-6">
        <MonitoramentoContent
          minDate={minDate.toISOString()}
          qualityHeuristicIntervalMinutes={qualityHeuristicIntervalMinutes}
          isLocalRuntime={isLocalRuntime()}
          initialEvalId={initialEvalId}
        />
      </div>
      <div className="mt-6">
        <PermissionDenialsCard stats={denialStats} period={denialPeriod} />
      </div>
    </PageShell>
  );
}
