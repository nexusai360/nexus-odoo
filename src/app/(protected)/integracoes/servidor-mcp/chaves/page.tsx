import { Key } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChavesLista } from "@/components/integracoes/servidor-mcp/chaves-lista";
import { listMcpApiKeys } from "@/lib/actions/mcp-api-keys";
import Link from "next/link";

export const metadata = { title: "Chaves de Acesso | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ChavesPage() {
  const result = await listMcpApiKeys();
  const keys = result.success ? result.data : [];

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Servidor MCP", href: "/integracoes/servidor-mcp" },
          { label: "Chaves de Acesso" },
        ]}
      />
      <PageHeader
        icon={Key}
        title="Servidor MCP"
        subtitle="Endpoint semântico para agentes de IA — RBAC de 7 camadas, Streamable HTTP"
      />

      <Tabs defaultValue="chaves" className="mt-6">
        <TabsList>
          <TabsTrigger
            value="visao-geral" nativeButton={false}
            render={<Link href="/integracoes/servidor-mcp" />}
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="chaves">Chaves de Acesso</TabsTrigger>
          <TabsTrigger value="logs" nativeButton={false} render={<Link href="/integracoes/servidor-mcp/logs" />}>
            Logs
          </TabsTrigger>
          <TabsTrigger value="docs" nativeButton={false} render={<Link href="/integracoes/servidor-mcp/docs" />}>
            Documentação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chaves" className="mt-6">
          <ChavesLista initial={keys} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
