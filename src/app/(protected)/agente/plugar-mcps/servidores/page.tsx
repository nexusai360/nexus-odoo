import { PlugarMcpsContent } from "@/components/agent/plugar-mcps-content";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { plugarMcpsTour } from "@/lib/tours/plugar-mcps-tour";
import { listExternalMcpServers } from "@/lib/actions/external-mcp-servers";

export const metadata = { title: "Servidores | Plugar MCPs | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Aba Servidores: lista e conexão de servidores MCP externos. */
export default async function PlugarMcpsServidoresPage() {
  const result = await listExternalMcpServers();
  const initial = result.success ? result.data : [];

  return (
    <>
      <TourAutoStart tour={plugarMcpsTour} />
      <div className="mt-6">
        <PlugarMcpsContent initial={initial} />
      </div>
    </>
  );
}
