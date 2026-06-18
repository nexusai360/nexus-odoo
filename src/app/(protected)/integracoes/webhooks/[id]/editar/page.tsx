import { notFound } from "next/navigation";
import { Webhook } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { WebhookEditForm } from "@/components/integracoes/webhook-edit-form";
import { getWebhook } from "@/lib/actions/webhooks";

export const metadata = { title: "Editar webhook | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function EditarWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getWebhook(id);
  if (!result.success) notFound();

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
        subtitle={result.data.name ?? "Webhook"}
      />
      <div className="mt-6">
        <WebhookEditForm webhook={result.data} />
      </div>
    </PageShell>
  );
}
