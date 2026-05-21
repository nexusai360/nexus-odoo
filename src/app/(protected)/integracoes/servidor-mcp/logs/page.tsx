import { Terminal } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LogsTimeline } from "@/components/integracoes/servidor-mcp/logs-timeline";
import { queryAuditLogs } from "@/lib/actions/mcp-audit-query";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Logs / Audit | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const result = await queryAuditLogs({});
  const initial = result.success
    ? result.data
    : { items: [], nextCursor: null, total: 0 };

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
        subtitle="Endpoint semântico para agentes de IA — RBAC de 7 camadas, Streamable HTTP"
      />

      <Tabs defaultValue="logs" className="mt-6">
        <TabsList>
          <TabsTrigger
            value="visao-geral"
            render={<Link href="/integracoes/servidor-mcp" />}
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="chaves"
            render={<Link href="/integracoes/servidor-mcp/chaves" />}
          >
            Chaves de Acesso
          </TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger
            value="docs"
            render={<Link href="/integracoes/servidor-mcp/docs" />}
          >
            Documentação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-6">
          <LogsTimeline initial={initial} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
