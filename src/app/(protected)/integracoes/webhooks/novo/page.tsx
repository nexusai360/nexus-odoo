import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { WebhookCreateClient } from "@/components/integracoes/webhook-create-client";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";
import { listWebhooks } from "@/lib/actions/webhooks";
import { getCurrentUser } from "@/lib/auth";
import { kindsVisiveis } from "@/lib/integrations/webhook-permissions";

export const metadata = { title: "Novo webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function NovoWebhookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // "Receber mensagens do WhatsApp" e exclusivo do super_admin. Os demais so veem
  // os dois tipos genericos. As server actions recusam de novo, no servidor.
  const kindsPermitidos = kindsVisiveis(user.platformRole);

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
  // Nome e unico entre TODOS os webhooks (qualquer tipo).
  const existingNames = items.map((w) => w.name ?? "").filter(Boolean);

  // O breadcrumb e o cabeçalho são renderizados pelo client (refletem o tipo).
  return (
    <PageShell variant="narrow">
      <WebhookCreateClient
        kindsPermitidos={kindsPermitidos}
        inboundBaseUrl={inboundBaseUrl}
        existingPaths={existingPaths}
        existingBusinessIds={existingBusinessIds}
        existingNames={existingNames}
      />
    </PageShell>
  );
}
