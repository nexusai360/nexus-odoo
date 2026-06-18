"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SecretRevealStep } from "@/components/ui/secret-reveal-step";
import { PhoneInput } from "@/components/ui/phone-input";
import { FieldValidateButton } from "@/components/integrations/field-validate-button";
import { WebhookEventSelector } from "@/components/integrations/webhook-event-selector";
import { WhatsappInboundHelp } from "@/components/integrations/whatsapp-inbound-help";
import { KindBanner } from "@/components/integrations/webhook-wizard";
import {
  type Country,
  DEFAULT_COUNTRY,
  composeE164,
  splitE164,
  validateNationalPhone,
} from "@/lib/whatsapp/countries";
import { cn } from "@/lib/utils";
import {
  updateWebhook,
  rotateWebhookSecret,
  type WebhookListItem,
  type WebhookEventName,
  type WebhookMethod,
} from "@/lib/actions/webhooks";

const HTTP_METHODS: WebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/;

/** Form full-page de edição de webhook (F5.1). Inclui descrição, recebe-WhatsApp,
 *  número da empresa, eventos e a ajuda do JSON. */
export function WebhookEditForm({
  webhook,
  inboundBaseUrl,
}: {
  webhook: WebhookListItem;
  inboundBaseUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isInbound = webhook.direction === "inbound";

  const [name, setName] = useState(webhook.name ?? "");
  const [description, setDescription] = useState(webhook.description ?? "");
  const [path, setPath] = useState(webhook.path ?? "");
  const [targetUrl, setTargetUrl] = useState(webhook.targetUrl ?? "");
  const [methods, setMethods] = useState<WebhookMethod[]>(webhook.methods as WebhookMethod[]);
  const [events, setEvents] = useState<WebhookEventName[]>(webhook.events ?? []);
  const isWhatsapp = webhook.isWhatsappReceiver;
  const kind = !isInbound ? "outbound" : isWhatsapp ? "whatsapp" : "inbound_generic";
  const initBiz = splitE164(webhook.businessId ?? "");
  const [bizCountry, setBizCountry] = useState<Country>(initBiz.country ?? DEFAULT_COUNTRY);
  const [bizNational, setBizNational] = useState(initBiz.nationalDigits);
  const [bizTouched, setBizTouched] = useState(false);
  const [pathTouched, setPathTouched] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Validação em tempo real do endereço (slug) e do número da empresa.
  const pathValid = PATH_RE.test(path.trim());
  const showPathError = !pathValid && (path.trim().length > 0 || pathTouched);
  const bizErrorMsg = validateNationalPhone(bizCountry, bizNational);
  const bizValid = bizErrorMsg === null;
  const showBizError = !bizValid && (bizNational.length > 0 || bizTouched);
  // `business_id` gravado: dígitos do número internacional (DDI + nacional), sem o "+".
  const businessIdDigits = bizNational ? composeE164(bizCountry.dial, bizNational).slice(1) : "";

  function toggleMethod(m: WebhookMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function back() {
    router.push("/integracoes/webhooks");
    router.refresh();
  }

  function handleRotate() {
    startTransition(async () => {
      const r = await rotateWebhookSecret(webhook.id);
      if (r.success) setRevealedSecret(r.data.secretPlain);
      else toast.error(r.error ?? "Erro ao rotacionar token");
    });
  }

  const valid =
    name.trim().length > 0 &&
    methods.length > 0 &&
    (isInbound
      ? pathValid && (!isWhatsapp || bizValid)
      : isValidUrl(targetUrl.trim()));

  function handleSave() {
    startTransition(async () => {
      const r = await updateWebhook(webhook.id, {
        name: name.trim(),
        description: description.trim() || null,
        path: isInbound ? path.trim() : null,
        targetUrl: isInbound ? null : targetUrl.trim(),
        methods: isWhatsapp ? ["POST"] : methods,
        events: isInbound ? undefined : events,
        isWhatsappReceiver: isInbound ? isWhatsapp : undefined,
        businessId: isInbound && isWhatsapp ? businessIdDigits : undefined,
      });
      if (r.success) {
        toast.success("Webhook atualizado");
        back();
      } else {
        toast.error(r.error ?? "Erro ao atualizar webhook");
      }
    });
  }

  if (revealedSecret) {
    return (
      <div className="space-y-4 rounded-xl border border-border p-6">
        <SecretRevealStep
          secret={revealedSecret}
          label="Token do webhook"
          onAcknowledge={() => setRevealedSecret(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-border p-6">
      <KindBanner kind={kind} />

      <div className="space-y-1.5">
        <Label htmlFor="wh-name">Nome</Label>
        <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wh-desc">Descrição</Label>
        <Textarea
          id="wh-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="O que este webhook faz (opcional)."
          rows={2}
        />
      </div>

      {isInbound ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="wh-path">Endereço (URL)</Label>
            <div className="flex items-stretch gap-2">
              <Input
                id="wh-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="whatsapp/loja-matriz"
                className="flex-1"
                aria-invalid={showPathError}
              />
              <FieldValidateButton
                valid={pathValid}
                onClick={() => setPathTouched(true)}
                label="Validar endereço"
              />
            </div>
            {showPathError ? (
              <p className="text-xs text-destructive" role="alert">
                Apenas minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            )}
          </div>

          {isWhatsapp && (
            <div className="space-y-1.5">
              <Label htmlFor="wh-business">Número da empresa</Label>
              <div className="flex items-stretch gap-2">
                <PhoneInput
                  className="flex-1"
                  country={bizCountry}
                  onCountryChange={setBizCountry}
                  national={bizNational}
                  onNationalChange={setBizNational}
                  invalid={showBizError}
                  inputId="wh-business"
                />
                <FieldValidateButton
                  valid={bizValid}
                  onClick={() => setBizTouched(true)}
                  label="Validar número"
                />
              </div>
              {showBizError ? (
                <p className="text-xs text-destructive" role="alert">
                  {bizErrorMsg}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Número do WhatsApp da empresa que recebe as mensagens. Identifica este webhook e não pode repetir.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="wh-url">URL de destino</Label>
          <Input
            id="wh-url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://exemplo.com/webhook/abc"
            aria-invalid={targetUrl.length > 0 && !isValidUrl(targetUrl.trim())}
          />
        </div>
      )}

      {isWhatsapp ? (
        <div className="space-y-1.5">
          <Label>Método HTTP</Label>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
              <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
              POST
            </span>
            <span className="text-xs text-muted-foreground">
              Definido automaticamente.
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Métodos HTTP</Label>
          <div className="flex flex-wrap gap-1.5">
            {HTTP_METHODS.map((m) => {
              const on = methods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMethod(m)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isWhatsapp && <WhatsappInboundHelp inboundBaseUrl={inboundBaseUrl} path={path} />}

      {!isInbound && (
        <div className="space-y-2">
          <Label>Eventos</Label>
          <WebhookEventSelector value={events} onChange={setEvents} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Token de assinatura</p>
            <p className="text-xs text-muted-foreground">Gere um novo token e invalide o anterior.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={isPending}
            onClick={handleRotate}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Rotacionar
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" onClick={back} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSave} disabled={isPending || !valid} className="gap-1.5">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
