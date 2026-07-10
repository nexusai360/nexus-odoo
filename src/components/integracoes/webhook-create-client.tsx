"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { WebhookWizard } from "@/components/integrations/webhook-wizard";
import {
  webhookKindBadgeClass,
  webhookKindLabel,
  webhookKindSubtitle,
  type WebhookKind,
} from "@/lib/integrations/webhook-kind";
import { cn } from "@/lib/utils";

/** Tela cheia de criação de webhook. Dona do tipo escolhido, para refletir na
 *  navegação (breadcrumb) e no cabeçalho, e navega de volta ao fim. */
export function WebhookCreateClient({
  inboundBaseUrl,
  existingPaths,
  existingBusinessIds,
  kindsPermitidos,
}: {
  inboundBaseUrl: string;
  existingPaths: string[];
  existingBusinessIds: string[];
  /** Tipos que o perfil pode criar (resolvido no servidor). */
  kindsPermitidos: WebhookKind[];
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<WebhookKind | null>(null);
  // Bump remonta o wizard (reset para o passo 1 de seleção de tipo).
  const [resetKey, setResetKey] = React.useState(0);

  function resetToType() {
    setKind(null);
    setResetKey((k) => k + 1);
  }

  const items = [
    { label: "Integrações", href: "/integracoes" },
    { label: "Webhooks", href: "/integracoes/webhooks" },
    kind
      ? { label: "Tipo de webhook", onClick: resetToType }
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
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                webhookKindBadgeClass(kind),
              )}
            >
              {webhookKindLabel(kind)}
            </span>
          ) : undefined
        }
      />
      <div className="mt-6">
        <WebhookWizard
          kindsPermitidos={kindsPermitidos}
          key={resetKey}
          inboundBaseUrl={inboundBaseUrl}
          existingPaths={existingPaths}
          existingBusinessIds={existingBusinessIds}
          onKindChange={setKind}
          onCreated={() => {
            toast.success("Webhook criado");
            router.push("/integracoes/webhooks");
            router.refresh();
          }}
          onConexaoCriada={() => {
            toast.success("Conexão com WhatsApp criada");
            router.push("/integracoes/webhooks");
            router.refresh();
          }}
          onCancel={() => router.push("/integracoes/webhooks")}
        />
      </div>
    </>
  );
}
