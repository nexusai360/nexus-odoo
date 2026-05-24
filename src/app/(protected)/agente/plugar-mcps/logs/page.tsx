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
    <div className="mt-6">
      <ExternalMcpLogs initial={initial} servers={servers} />
    </div>
  );
}
