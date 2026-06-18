"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import {
  WebhookWizard,
  webhookKindLabel,
  webhookKindSubtitle,
  type WebhookKind,
} from "@/components/integrations/webhook-wizard";

/** Tela cheia de criação de webhook. Dona do tipo escolhido, para refletir na
 *  navegação (breadcrumb) e no cabeçalho, e navega de volta ao fim. */
export function WebhookCreateClient({ inboundBaseUrl }: { inboundBaseUrl: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<WebhookKind | null>(null);

  const items = [
    { label: "Integrações", href: "/integracoes" },
    { label: "Webhooks", href: "/integracoes/webhooks" },
    kind
      ? { label: "Tipo de webhook", href: "/integracoes/webhooks/novo" }
      : { label: "Tipo de webhook" },
    ...(kind ? [{ label: webhookKindLabel(kind) }] : []),
  ];

  return (
    <>
      <Breadcrumb items={items} />
      <PageHeader
        icon={Webhook}
        title={kind ? "Novo webhook" : "Tipo de webhook"}
        subtitle={webhookKindSubtitle(kind)}
        titleAccessory={
          kind ? (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
              {webhookKindLabel(kind)}
            </span>
          ) : undefined
        }
      />
      <div className="mt-6">
        <WebhookWizard
          inboundBaseUrl={inboundBaseUrl}
          onKindChange={setKind}
          onCreated={() => {
            toast.success("Webhook criado");
            router.push("/integracoes/webhooks");
            router.refresh();
          }}
          onCancel={() => router.push("/integracoes/webhooks")}
        />
      </div>
    </>
  );
}
