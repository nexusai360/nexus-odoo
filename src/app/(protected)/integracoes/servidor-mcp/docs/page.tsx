import { BookOpen } from "lucide-react";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { McpDocsContent } from "@/components/integracoes/servidor-mcp/mcp-docs-content";
import { getMcpCatalogSchema } from "@/lib/actions/mcp-catalog-schema";
import { resolveMcpPublicUrl } from "@/lib/mcp-public-url";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Documentação | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [catalogResult, mcpPublicUrl] = await Promise.all([
    getMcpCatalogSchema(),
    resolveMcpPublicUrl(),
  ]);
  const catalog = catalogResult.success ? catalogResult.data : [];

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Servidor MCP", href: "/integracoes/servidor-mcp" },
          { label: "Documentação" },
        ]}
      />
      <PageHeader
        icon={BookOpen}
        title="Servidor MCP"
        subtitle="Endpoint semântico para agentes de IA, RBAC de 7 camadas, Streamable HTTP"
      />

      <ServidorMcpNav />
      <div className="mt-6">
        <McpDocsContent catalog={catalog} mcpUrl={mcpPublicUrl} />
      </div>
    </PageShell>
  );
}
