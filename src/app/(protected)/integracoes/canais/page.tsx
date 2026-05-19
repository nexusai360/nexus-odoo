import { ChevronRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getWhatsappChannel } from "@/lib/actions/whatsapp-channel";

export const metadata = { title: "Canais | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function CanaisPage() {
  const channelResult = await getWhatsappChannel();
  const channel = channelResult.success ? channelResult.data : null;
  const isConfigured = channel?.businessAccountId && channel?.phoneNumberId;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={MessageSquare}
        title="Canais"
        subtitle="Configure os canais de comunicação disponíveis na plataforma"
      />

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Link href="/integracoes/canais/whatsapp" className="group block focus-visible:outline-none">
          <Card className="cursor-pointer transition-shadow duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-violet-400/60">
            <CardContent className="p-6 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <span className="p-1.5 rounded-lg bg-violet-500/10">
                  <MessageSquare className="h-8 w-8 text-violet-500" />
                </span>
                <span
                  className={
                    isConfigured
                      ? "text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  }
                >
                  {isConfigured ? "Configurado" : "Não configurado"}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold">WhatsApp</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Conecte a Meta Graph API para receber e enviar mensagens via WhatsApp Business
                </p>
              </div>
              <div className="flex justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </PageShell>
  );
}
