import { MessageSquare } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { WhatsappChannelForm } from "@/components/integracoes/whatsapp-channel-form";
import { getWhatsappChannel } from "@/lib/actions/whatsapp-channel";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";

export const metadata = { title: "WhatsApp | Canais | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function WhatsappChannelPage() {
  const result = await getWhatsappChannel();
  const channel = result.success ? result.data : null;

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Canais", href: "/integracoes/canais" },
          { label: "WhatsApp" },
        ]}
      />
      <PageHeader
        icon={MessageSquare}
        title="WhatsApp"
        subtitle="Configure as credenciais da Meta Graph API para o canal WhatsApp Business"
      />

      <div className="mt-6">
        <WhatsappChannelForm initial={channel} />
      </div>
    </PageShell>
  );
}
