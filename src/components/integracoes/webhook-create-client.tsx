"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WebhookWizard } from "@/components/integrations/webhook-wizard";

/** Wrapper client da tela cheia de criação de webhook (navega de volta ao fim). */
export function WebhookCreateClient({ inboundBaseUrl }: { inboundBaseUrl: string }) {
  const router = useRouter();
  return (
    <WebhookWizard
      inboundBaseUrl={inboundBaseUrl}
      onCreated={() => {
        toast.success("Webhook criado");
        router.push("/integracoes/webhooks");
        router.refresh();
      }}
      onCancel={() => router.push("/integracoes/webhooks")}
    />
  );
}
