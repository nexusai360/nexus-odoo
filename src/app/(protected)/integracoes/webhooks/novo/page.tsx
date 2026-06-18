import { PageShell } from "@/components/layout/page-shell";
import { WebhookCreateClient } from "@/components/integracoes/webhook-create-client";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";

export const metadata = { title: "Novo webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function NovoWebhookPage() {
  const inboundBaseUrl = await resolveWebhookInboundBase();
  // O breadcrumb e o cabeçalho são renderizados pelo client (refletem o tipo).
  return (
    <PageShell variant="narrow">
      <WebhookCreateClient inboundBaseUrl={inboundBaseUrl} />
    </PageShell>
  );
}
