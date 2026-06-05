/**
 * /agente/monitoramento/bubble , aba Bubble do Monitoramento do Agente Nex.
 *
 * Gate: super_admin (layout do grupo /agente). Visão read-only de 3 colunas:
 * colaboradores -> sessões -> conversa fiel à bubble.
 *
 * Spec: docs/superpowers/specs/2026-06-04-b2-monitoramento-bubble-design.md
 */

import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { BubbleMonitor } from "@/components/agent/monitoramento/bubble-monitor";
import { MonitoramentoNav } from "@/components/agent/monitoramento-nav";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Monitoramento do Agente · Bubble | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function MonitoramentoBubblePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Activity}
        title="Monitoramento do Agente Nex"
        subtitle="Conversas dos colaboradores com o Agente Nex: sessões, avaliações e feedback."
      />
      <MonitoramentoNav />
      <div className="mt-6">
        <BubbleMonitor />
      </div>
    </PageShell>
  );
}
