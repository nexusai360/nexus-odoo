import { PlugarMcpsVisaoGeral } from "@/components/agent/plugar-mcps-visao-geral";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";
import { externalMcpCallStats } from "@/lib/actions/external-mcp-call-log";

export const metadata = { title: "Plugar MCPs | Agente Nex | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Aba Visão Geral: resumo do estado e do uso dos MCPs externos. */
export default async function PlugarMcpsPage() {
  const [serversResult, statsResult] = await Promise.all([
    listExternalMcpServers(),
    externalMcpCallStats(24),
  ]);
  const servers = serversResult.success ? serversResult.data : [];
  const stats = statsResult.success ? statsResult.data : null;

  return (
    <div className="mt-6">
      <PlugarMcpsVisaoGeral servers={servers} stats={stats} />
    </div>
  );
}
