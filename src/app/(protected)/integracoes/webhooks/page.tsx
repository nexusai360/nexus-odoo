import { Webhook } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { WebhooksContent } from "@/components/integracoes/webhooks-content";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { webhookTour } from "@/lib/tours/webhook-tour";
import { listWebhooks } from "@/lib/actions/webhooks";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";

export const metadata = { title: "Webhooks | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const [result, inboundBaseUrl] = await Promise.all([
    listWebhooks(),
    resolveWebhookInboundBase(),
  ]);
  const webhooks = result.success ? result.data : [];

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Webhooks" },
        ]}
      />
      <PageHeader
        icon={Webhook}
        title="Webhooks"
        subtitle="Endpoints para receber e enviar eventos de integração com outros sistemas"
        titleAccessory={<TourTriggerButton config={webhookTour} />}
      />
      <TourAutoStart tour={webhookTour} />

      <div className="mt-6">
        <WebhooksContent initial={webhooks} inboundBaseUrl={inboundBaseUrl} />
      </div>
    </PageShell>
  );
}
