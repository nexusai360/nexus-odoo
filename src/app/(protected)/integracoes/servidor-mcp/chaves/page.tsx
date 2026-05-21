import { Key } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { ChavesLista } from "@/components/integracoes/servidor-mcp/chaves-lista";
import { listMcpApiKeys } from "@/lib/actions/mcp-api-keys";

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

      <ServidorMcpNav />
      <div className="mt-6">
        <ChavesLista initial={keys} />
      </div>
    </PageShell>
  );
}
