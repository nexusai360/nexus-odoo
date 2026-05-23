import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Cable } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsNav } from "@/components/agent/plugar-mcps-nav";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { plugarMcpsTour } from "@/lib/tours/plugar-mcps-tour";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout da rota /agente/plugar-mcps. Gate super_admin + cabeçalho e abas
 * renderizados aqui uma única vez, idênticos para Visão Geral, Servidores e
 * Logs, sem salto de layout ao trocar de aba.
 */
export default async function PlugarMcpsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return (
    <PageShell variant="agent">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"
        titleAccessory={<TourTriggerButton config={plugarMcpsTour} />}
      />
      <PlugarMcpsNav />
      {children}
    </PageShell>
  );
}
