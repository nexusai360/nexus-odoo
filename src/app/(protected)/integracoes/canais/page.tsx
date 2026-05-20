import { ChevronRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { getWhatsappChannel } from "@/lib/actions/whatsapp-channel";

export const metadata = { title: "Canais | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function CanaisPage() {
  const channelResult = await getWhatsappChannel();
  const channel = channelResult.success ? channelResult.data : null;
  const isConfigured = channel?.businessAccountId && channel?.phoneNumberId;

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Canais" },
        ]}
      />
      <PageHeader
        icon={MessageSquare}
        title="Canais"
        subtitle="Configure os canais de comunicação disponíveis na plataforma."
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/integracoes/canais/whatsapp"
          className="group block focus-visible:outline-none"
        >
          <Card className="cursor-pointer transition-shadow duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-violet-400/60">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                <MessageSquare className="h-5 w-5 text-violet-500" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">WhatsApp</p>
                  <Badge
                    variant="outline"
                    className={
                      isConfigured
                        ? "shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                        : "shrink-0 text-[10px] text-muted-foreground"
                    }
                  >
                    {isConfigured ? "Configurado" : "Não configurado"}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  Meta Graph API para receber e enviar mensagens via WhatsApp
                  Business.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </PageShell>
  );
}
