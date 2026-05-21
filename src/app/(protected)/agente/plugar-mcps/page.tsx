import { Cable } from "lucide-react";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsContent } from "@/components/agent/plugar-mcps-content";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { plugarMcpsTour } from "@/lib/tours/plugar-mcps-tour";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Plugar MCPs | Agente Nex | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function PlugarMcpsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const result = await listExternalMcpServers();
  const initial = result.success ? result.data : [];

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"
        actions={<TourTriggerButton config={plugarMcpsTour} />}
      />
      <TourAutoStart tour={plugarMcpsTour} />

      <div className="mt-6">
        <PlugarMcpsContent initial={initial} />
      </div>
    </PageShell>
  );
}
