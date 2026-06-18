import { Webhook } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { WebhookCreateClient } from "@/components/integracoes/webhook-create-client";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";

export const metadata = { title: "Novo webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function NovoWebhookPage() {
  const inboundBaseUrl = await resolveWebhookInboundBase();
  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Webhooks", href: "/integracoes/webhooks" },
          { label: "Novo" },
        ]}
      />
      <PageHeader
        icon={Webhook}
        title="Novo webhook"
        subtitle="Configure um webhook para receber ou enviar eventos de outros sistemas"
      />
      <div className="mt-6">
        <WebhookCreateClient inboundBaseUrl={inboundBaseUrl} />
      </div>
    </PageShell>
  );
}
