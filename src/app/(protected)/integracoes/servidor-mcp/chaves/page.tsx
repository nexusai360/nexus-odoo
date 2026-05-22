import { Key } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { ChavesLista } from "@/components/integracoes/servidor-mcp/chaves-lista";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { servidorMcpChavesTour } from "@/lib/tours/servidor-mcp-tour";
import { listMcpApiKeys } from "@/lib/actions/mcp-api-keys";
import { getMcpCatalogSchema } from "@/lib/actions/mcp-catalog-schema";
import { deriveModuleWriteActions } from "@/lib/mcp-capability-levels";

export const metadata = { title: "Chaves de Acesso | Servidor MCP | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ChavesPage() {
  const [result, catalogResult] = await Promise.all([
    listMcpApiKeys(),
    getMcpCatalogSchema(),
  ]);
  const keys = result.success ? result.data : [];
  // Ações de escrita por módulo derivadas das write tools reais do catálogo.
  const moduleWriteActions = catalogResult.success
    ? deriveModuleWriteActions(catalogResult.data)
    : {};

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
        subtitle="Endpoint semântico para agentes de IA, RBAC de 7 camadas, Streamable HTTP"
        titleAccessory={<TourTriggerButton config={servidorMcpChavesTour} />}
      />
      <TourAutoStart tour={servidorMcpChavesTour} />

      <ServidorMcpNav />
      <div className="mt-6">
        <ChavesLista initial={keys} moduleWriteActions={moduleWriteActions} />
      </div>
    </PageShell>
  );
}
