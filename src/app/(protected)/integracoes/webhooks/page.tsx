import { Webhook } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { WebhooksContent } from "@/components/integracoes/webhooks-content";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { webhookTour } from "@/lib/tours/webhook-tour";
import { listWebhooks } from "@/lib/actions/webhooks";
import { listConnections } from "@/lib/actions/whatsapp-connection";
import { getCurrentUser } from "@/lib/auth";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";

export const metadata = { title: "Webhooks | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const user = await getCurrentUser();
  // Conexoes com WhatsApp sao territorio do super_admin; os demais perfis veem
  // so os webhooks genericos (listWebhooks ja esconde as linhas de conexao).
  const podeVerConexoes = user?.platformRole === "super_admin";

  const [inboundBaseUrl, dados] = await Promise.all([
    resolveWebhookInboundBase(),
    podeVerConexoes ? listConnections() : listWebhooks(),
  ]);

  const webhooks = dados.success
    ? "avulsos" in dados.data
      ? dados.data.avulsos
      : dados.data
    : [];
  const conexoes = dados.success && "conexoes" in dados.data ? dados.data.conexoes : [];

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
        <WebhooksContent
          initial={webhooks}
          initialConexoes={conexoes}
          podeVerConexoes={podeVerConexoes}
          inboundBaseUrl={inboundBaseUrl}
        />
      </div>
    </PageShell>
  );
}
