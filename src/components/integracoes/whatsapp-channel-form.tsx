"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  updateWhatsappChannel,
  type WhatsappChannelData,
  type UpdateWhatsappChannelInput,
} from "@/lib/actions/whatsapp-channel";

interface Props {
  initial: WhatsappChannelData | null;
}

export function WhatsappChannelForm({ initial }: Props) {
  const [isPending, startTransition] = useTransition();

  const [apiToken, setApiToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState(
    initial?.businessAccountId ?? "",
  );
  const [phoneNumberId, setPhoneNumberId] = useState(
    initial?.phoneNumberId ?? "",
  );
  const [responseMode, setResponseMode] = useState<"direct" | "n8n_webhook">(
    initial?.responseMode ?? "direct",
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: UpdateWhatsappChannelInput = {
      businessAccountId,
      phoneNumberId,
      responseMode,
      enabled,
    };

    // Só inclui token se preenchido (evita sobrescrever com vazio)
    if (apiToken.trim()) {
      payload.apiToken = apiToken.trim();
    }

    startTransition(async () => {
      const result = await updateWhatsappChannel(payload);
      if (result.success) {
        toast.success("Canal WhatsApp atualizado");
        setApiToken(""); // limpa campo de token após salvar
      } else {
        toast.error(result.error ?? "Erro ao atualizar canal");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {/* Token da Graph API */}
      <div className="space-y-2">
        <Label htmlFor="api-token">Token da Graph API</Label>
        <Input
          id="api-token"
          type="password"
          placeholder={
            initial?.maskedApiToken
              ? `Atual: ${initial.maskedApiToken} — deixe em branco para manter`
              : "Cole o token de acesso permanente da Meta"
          }
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          O token é cifrado antes de ser armazenado e nunca exibido em claro.
        </p>
      </div>

      {/* Business Account ID */}
      <div className="space-y-2">
        <Label htmlFor="business-account-id">Business Account ID</Label>
        <Input
          id="business-account-id"
          placeholder="Ex: 123456789012345"
          value={businessAccountId}
          onChange={(e) => setBusinessAccountId(e.target.value)}
          required
        />
      </div>

      {/* Phone Number ID */}
      <div className="space-y-2">
        <Label htmlFor="phone-number-id">Phone Number ID</Label>
        <Input
          id="phone-number-id"
          placeholder="Ex: 987654321098765"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          required
        />
      </div>

      {/* Modo de resposta */}
      <div className="space-y-2">
        <Label htmlFor="response-mode">Modo de resposta</Label>
        <Select
          value={responseMode}
          onValueChange={(v) => setResponseMode(v as "direct" | "n8n_webhook")}
        >
          <SelectTrigger id="response-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">
              Direto — a plataforma envia a resposta via Graph API
            </SelectItem>
            <SelectItem value="n8n_webhook">
              Webhook n8n — a resposta é enviada via webhook de saída
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          No modo &quot;Webhook n8n&quot;, configure também o webhook de saída em{" "}
          <a href="/integracoes/webhooks" className="text-violet-500 hover:underline">
            Integrações → Webhooks
          </a>
          .
        </p>
      </div>

      {/* Canal habilitado */}
      <div className="flex items-center gap-3">
        <Switch
          id="enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="enabled" className="cursor-pointer">
          Canal habilitado
        </Label>
      </div>

      <Button type="submit" disabled={isPending} className="gap-2">
        <Save className="h-4 w-4" />
        {isPending ? "Salvando…" : "Salvar configuração"}
      </Button>
    </form>
  );
}
