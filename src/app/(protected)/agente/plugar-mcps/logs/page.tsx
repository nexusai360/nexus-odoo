import { Cable } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsNav } from "@/components/agent/plugar-mcps-nav";
import { ExternalMcpLogs } from "@/components/agent/external-mcp-logs";
import { queryExternalMcpCallLogs } from "@/lib/actions/external-mcp-call-log";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";

export const metadata = { title: "Logs | Plugar MCPs | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Aba Logs: chamadas do Agente Nex aos servidores MCP externos. */
export default async function PlugarMcpsLogsPage() {
  const [logsResult, serversResult] = await Promise.all([
    queryExternalMcpCallLogs({}),
    listExternalMcpServers(),
  ]);
  const initial = logsResult.success
    ? logsResult.data
    : { items: [], nextCursor: null, total: 0 };
  const servers = serversResult.success
    ? serversResult.data.map((s) => ({ id: s.id, name: s.name }))
    : [];

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"
      />

      <PlugarMcpsNav />
      <div className="mt-6">
        <ExternalMcpLogs initial={initial} servers={servers} />
      </div>
    </PageShell>
  );
}
