import { BookOpen } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { McpDocsLayout } from "@/components/integracoes/servidor-mcp/docs-layout";
import { docSections } from "@/content/mcp-docs/index";
import { getMcpCatalogSchema } from "@/lib/actions/mcp-catalog-schema";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Documentação | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const catalogResult = await getMcpCatalogSchema();
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
        subtitle="Endpoint semântico para agentes de IA — RBAC de 7 camadas, Streamable HTTP"
      />

      <Tabs defaultValue="docs" className="mt-6">
        <TabsList>
          <TabsTrigger
            value="visao-geral" nativeButton={false}
            render={<Link href="/integracoes/servidor-mcp" />}
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="chaves" nativeButton={false}
            render={<Link href="/integracoes/servidor-mcp/chaves" />}
          >
            Chaves de Acesso
          </TabsTrigger>
          <TabsTrigger
            value="logs" nativeButton={false}
            render={<Link href="/integracoes/servidor-mcp/logs" />}
          >
            Logs
          </TabsTrigger>
          <TabsTrigger value="docs">Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="mt-6">
          <McpDocsLayout sections={docSections} catalog={catalog} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
