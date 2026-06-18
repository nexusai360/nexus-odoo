import { PageShell } from "@/components/layout/page-shell";
import { WebhookCreateClient } from "@/components/integracoes/webhook-create-client";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";
import { listWebhooks } from "@/lib/actions/webhooks";

export const metadata = { title: "Novo webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function NovoWebhookPage() {
  const [inboundBaseUrl, list] = await Promise.all([
    resolveWebhookInboundBase(),
    listWebhooks(),
  ]);
  // Slugs e números já usados, para validar unicidade em tempo real na criação.
  const items = list.success ? list.data : [];
  const existingPaths = items
    .filter((w) => w.direction === "inbound" && w.path)
    .map((w) => w.path as string);
  const existingBusinessIds = items
    .filter((w) => w.isWhatsappReceiver && w.businessId)
    .map((w) => w.businessId as string);

  // O breadcrumb e o cabeçalho são renderizados pelo client (refletem o tipo).
  return (
    <PageShell variant="narrow">
      <WebhookCreateClient
        inboundBaseUrl={inboundBaseUrl}
        existingPaths={existingPaths}
        existingBusinessIds={existingBusinessIds}
      />
    </PageShell>
  );
}
