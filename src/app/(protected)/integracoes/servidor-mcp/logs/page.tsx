import { Terminal } from "lucide-react";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { LogsTimeline } from "@/components/integracoes/servidor-mcp/logs-timeline";
import { queryAuditLogs } from "@/lib/actions/mcp-audit-query";
import { getMcpCatalogSchema } from "@/lib/actions/mcp-catalog-schema";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Logs / Audit | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [result, catalogResult] = await Promise.all([
    queryAuditLogs({}),
    getMcpCatalogSchema(),
  ]);
  const initial = result.success
    ? result.data
    : { items: [], nextCursor: null, total: 0 };

  // Mapa nome da tool -> descrição, para o detalhe do log explicar o que cada
  // chamada faz ("sucesso de quê").
  const toolDescriptions: Record<string, string> = {};
  if (catalogResult.success) {
    for (const mod of catalogResult.data) {
      for (const tool of [...mod.readTools, ...mod.writeTools]) {
        toolDescriptions[tool.id] = tool.descricao;
      }
    }
  }

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Servidor MCP", href: "/integracoes/servidor-mcp" },
          { label: "Logs / Audit" },
        ]}
      />
      <PageHeader
        icon={Terminal}
        title="Servidor MCP"
        subtitle="Endpoint semântico para agentes de IA, RBAC de 7 camadas, Streamable HTTP"
      />

      <ServidorMcpNav />
      <div className="mt-6">
        <LogsTimeline initial={initial} toolDescriptions={toolDescriptions} />
      </div>
    </PageShell>
  );
}
