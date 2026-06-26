/**
 * /agente/monitoramento/personalizacao , aba Personalização do Monitoramento.
 *
 * Gate: super_admin. Auditoria read-only do perfil de interação que o agente aprende de
 * cada usuário (camada determinística, Onda 1) + reset por usuário. So campos derivados.
 *
 * Spec: docs/superpowers/specs/2026-06-19-agente-personalizacao-por-usuario-design.md
 */

import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { PersonalizacaoContent } from "@/components/agent/monitoramento/personalizacao-content";
import { getUserProfilesForAudit } from "@/lib/actions/agent-user-profile";
import { MonitoramentoNav } from "@/components/agent/monitoramento-nav";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Monitoramento do Agente · Personalização | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function MonitoramentoPersonalizacaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const rows = await getUserProfilesForAudit();

  return (
    <PageShell variant="form">
      <PageHeader
        icon={Sparkles}
        title="Monitoramento do Agente Nex"
        subtitle="Personalização: o que o Nex aprendeu de cada usuário (assuntos, visão preferida, perguntas recorrentes). Preferências de atendimento, nunca regras."
      />
      <MonitoramentoNav />
      <div className="mt-6">
        <PersonalizacaoContent rows={rows} />
      </div>
    </PageShell>
  );
}
