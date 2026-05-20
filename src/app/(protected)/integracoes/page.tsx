import { Plug } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { IntegracoesGrid } from "@/components/integracoes/integracoes-grid";

export const metadata = { title: "Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default function IntegracoesPage() {
  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Plug}
        title="Integrações"
        subtitle="Gerencie canais, conexões MCP, webhooks, API keys e conectores BI"
      />
      <IntegracoesGrid />
    </PageShell>
  );
}
