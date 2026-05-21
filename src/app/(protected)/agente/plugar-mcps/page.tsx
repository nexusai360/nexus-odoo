import { Cable } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsNav } from "@/components/agent/plugar-mcps-nav";
import { PlugarMcpsVisaoGeral } from "@/components/agent/plugar-mcps-visao-geral";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";
import { externalMcpCallStats } from "@/lib/actions/external-mcp-call-log";

export const metadata = { title: "Plugar MCPs | Agente Nex | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Aba Visao Geral: resumo do estado e do uso dos MCPs externos. */
export default async function PlugarMcpsPage() {
  const [serversResult, statsResult] = await Promise.all([
    listExternalMcpServers(),
    externalMcpCallStats(24),
  ]);
  const servers = serversResult.success ? serversResult.data : [];
  const stats = statsResult.success ? statsResult.data : null;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"
      />

      <PlugarMcpsNav />
      <div className="mt-6">
        <PlugarMcpsVisaoGeral servers={servers} stats={stats} />
      </div>
    </PageShell>
  );
}
