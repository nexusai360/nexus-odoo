import { Cable } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsNav } from "@/components/agent/plugar-mcps-nav";
import { PlugarMcpsContent } from "@/components/agent/plugar-mcps-content";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { plugarMcpsTour } from "@/lib/tours/plugar-mcps-tour";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";

export const metadata = { title: "Servidores | Plugar MCPs | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Aba Servidores: lista e conexao de servidores MCP externos. */
export default async function PlugarMcpsServidoresPage() {
  const result = await listExternalMcpServers();
  const initial = result.success ? result.data : [];

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"
        titleAccessory={<TourTriggerButton config={plugarMcpsTour} />}
      />
      <TourAutoStart tour={plugarMcpsTour} />

      <PlugarMcpsNav />
      <div className="mt-6">
        <PlugarMcpsContent initial={initial} />
      </div>
    </PageShell>
  );
}
