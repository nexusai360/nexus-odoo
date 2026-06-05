/**
 * /agente/monitoramento/aprendizado , aba Aprendizado do Monitoramento.
 *
 * Gate: super_admin. Cruza a AVALIAÇÃO do usuário com a PERÍCIA da plataforma
 * para achar discordâncias e padrões de erro (matéria-prima de correção).
 *
 * Spec: docs/superpowers/specs/2026-06-04-b3-aprendizado-design.md
 */

import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { AprendizadoContent } from "@/components/agent/monitoramento/aprendizado-content";
import { getAprendizadoOverview } from "@/lib/actions/aprendizado";
import { MonitoramentoNav } from "@/components/agent/monitoramento-nav";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Monitoramento do Agente · Aprendizado | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function MonitoramentoAprendizadoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const overview = await getAprendizadoOverview();

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Activity}
        title="Monitoramento do Agente Nex"
        subtitle="Aprendizado: onde a avaliação do usuário e a perícia da plataforma divergem, e os padrões de erro a corrigir."
      />
      <MonitoramentoNav />
      <div className="mt-6">
        <AprendizadoContent overview={overview} />
      </div>
    </PageShell>
  );
}
