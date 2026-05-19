import { Key } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { ApiKeysContent } from "@/components/integracoes/api-keys-content";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { listApiKeys } from "@/lib/actions/api-keys";

export const metadata = { title: "API Keys | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const result = await listApiKeys();
  const keys = result.success ? result.data : [];

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "API" },
        ]}
      />
      <PageHeader
        icon={Key}
        title="API Keys"
        subtitle="Crie e gerencie chaves de acesso para integração programática com a plataforma"
      />

      <div className="mt-6">
        <ApiKeysContent initial={keys} />
      </div>
    </PageShell>
  );
}
