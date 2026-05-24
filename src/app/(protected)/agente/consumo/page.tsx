/**
 * /agente/consumo , Tela de consumo de tokens e custo de LLM.
 *
 * Gate: super_admin (aplicado também no layout do grupo /agente).
 * Server Component: busca a data mínima de uso e passa para o Client.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getFirstUsageDate } from "@/lib/agent/llm/usage-stats";
import { ConsumoContent } from "@/components/agent/consumo/consumo-content";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = { title: "Consumo do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function ConsumoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const minDate = await getFirstUsageDate();

  return (
    <PageShell variant="form">
      <PageHeader
        icon={TrendingUp}
        title="Consumo do Agente Nex"
        subtitle="Custo e uso de tokens por modelo, provedor e período."
      />
      <ConsumoContent minDate={minDate.toISOString()} />
    </PageShell>
  );
}
