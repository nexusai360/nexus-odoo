import { notFound } from "next/navigation";
import { Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { WebhookEditForm } from "@/components/integracoes/webhook-edit-form";
import {
  webhookKindBadgeClass,
  webhookKindLabel,
  type WebhookKind,
} from "@/lib/integrations/webhook-kind";
import { getWebhook, listWebhooks } from "@/lib/actions/webhooks";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";

export const metadata = { title: "Editar webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function EditarWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, inboundBaseUrl, list] = await Promise.all([
    getWebhook(id),
    resolveWebhookInboundBase(),
    listWebhooks(),
  ]);
  if (!result.success) notFound();

  const webhook = result.data;
  // Slugs e números dos OUTROS webhooks (exclui o atual), para unicidade.
  const others = (list.success ? list.data : []).filter((w) => w.id !== webhook.id);
  const existingPaths = others
    .filter((w) => w.direction === "inbound" && w.path)
    .map((w) => w.path as string);
  const existingBusinessIds = others
    .filter((w) => w.isWhatsappReceiver && w.businessId)
    .map((w) => w.businessId as string);
  // Nome e unico entre TODOS os webhooks (a lista ja exclui o proprio).
  const existingNames = others.map((w) => w.name ?? "").filter(Boolean);
  const kind: WebhookKind =
    webhook.direction !== "inbound"
      ? "outbound"
      : webhook.isWhatsappReceiver
        ? "whatsapp"
        : "inbound_generic";

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Webhooks", href: "/integracoes/webhooks" },
          { label: "Editar" },
        ]}
      />
      <PageHeader
        icon={Webhook}
        title="Editar webhook"
        subtitle={webhook.name ?? "Webhook"}
        titleAccessory={
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              webhookKindBadgeClass(kind),
            )}
          >
            {webhookKindLabel(kind)}
          </span>
        }
      />
      <div className="mt-6">
        <WebhookEditForm
          webhook={webhook}
          inboundBaseUrl={inboundBaseUrl}
          existingPaths={existingPaths}
          existingBusinessIds={existingBusinessIds}
          existingNames={existingNames}
        />
      </div>
    </PageShell>
  );
}
