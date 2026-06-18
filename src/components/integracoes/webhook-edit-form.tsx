"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SecretRevealStep } from "@/components/ui/secret-reveal-step";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  FieldValidateButton,
  type FieldConfirmVariant,
} from "@/components/integrations/field-validate-button";
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

/** Chave de comparação de arrays (ordem-insensível). */
function arrKey(arr: string[]): string {
  return [...arr].sort().join(",");
}

/** Form full-page de edição de webhook (F5.1). Inclui descrição, recebe-WhatsApp,
 *  número da empresa, eventos e a ajuda do JSON. */
export function WebhookEditForm({
  webhook,
  inboundBaseUrl,
  existingPaths = [],
  existingBusinessIds = [],
}: {
  webhook: WebhookListItem;
  inboundBaseUrl: string;
  /** Slugs de OUTROS webhooks (exclui o atual), para unicidade em tempo real. */
  existingPaths?: string[];
  /** business_id de OUTROS webhooks (exclui o atual), para unicidade. */
  existingBusinessIds?: string[];
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
  const initBizDigits = initBiz.nationalDigits
    ? composeE164(initBiz.country?.dial ?? DEFAULT_COUNTRY.dial, initBiz.nationalDigits).slice(1)
    : "";
  const [bizCountry, setBizCountry] = useState<Country>(initBiz.country ?? DEFAULT_COUNTRY);
  const [bizNational, setBizNational] = useState(initBiz.nationalDigits);
  const [bizTouched, setBizTouched] = useState(false);
  const [pathTouched, setPathTouched] = useState(false);
  // Valores já gravados começam "confirmados"; alterar exige reconfirmar.
  const [pathConfirmed, setPathConfirmed] = useState((webhook.path ?? "").trim());
  const [bizConfirmed, setBizConfirmed] = useState(initBizDigits);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Validação em tempo real (formato + unicidade contra os outros webhooks).
  const pathTrim = path.trim();
  const pathFormatOk = PATH_RE.test(pathTrim);
  const pathDuplicate = pathFormatOk && existingPaths.includes(pathTrim);
  const pathValid = pathFormatOk && !pathDuplicate;
  const pathErrorMsg = !pathFormatOk
    ? "Apenas minúsculas, números, hífen e barra. Precisa ser único."
    : pathDuplicate
      ? "Já existe um webhook de entrada com esse caminho."
      : null;
  const showPathError = pathErrorMsg !== null && (pathTrim.length > 0 || pathTouched);

  // `business_id` gravado: dígitos do número internacional (DDI + nacional), sem o "+".
  const businessIdDigits = bizNational ? composeE164(bizCountry.dial, bizNational).slice(1) : "";
  const bizFormatError = validateNationalPhone(bizCountry, bizNational);
  const bizDuplicate = bizFormatError === null && existingBusinessIds.includes(businessIdDigits);
  const bizValid = bizFormatError === null && !bizDuplicate;
  const bizErrorMsg = bizFormatError ?? (bizDuplicate ? "Já existe um webhook de WhatsApp com esse número." : null);
  const showBizError = bizErrorMsg !== null && (bizNational.length > 0 || bizTouched);

  // Estado visual + confirmação dos campos com botão de confirmar.
  const pathVariant: FieldConfirmVariant = !pathValid
    ? pathTrim.length > 0 || pathTouched
      ? "error"
      : "idle"
    : pathTrim === pathConfirmed
      ? "confirmed"
      : "pending";
  const bizVariant: FieldConfirmVariant = !bizValid
    ? bizNational.length > 0 || bizTouched
      ? "error"
      : "idle"
    : businessIdDigits === bizConfirmed
      ? "confirmed"
      : "pending";

  function confirmPath() {
    if (!pathValid) {
      setPathTouched(true);
      return;
    }
    setPathConfirmed(pathTrim);
    toast.success("Endereço atualizado");
  }

  function confirmBiz() {
    if (!bizValid) {
      setBizTouched(true);
      return;
    }
    setBizConfirmed(businessIdDigits);
    toast.success("Número da empresa atualizado");
  }

  // Ao sair do campo sem confirmar, volta ao último valor aplicado.
  function revertPath() {
    if (pathTrim !== pathConfirmed) {
      setPath(pathConfirmed);
      setPathTouched(false);
    }
  }

  const bizFieldRef = useRef<HTMLDivElement>(null);
  function revertBiz(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && bizFieldRef.current?.contains(next)) return;
    if (businessIdDigits !== bizConfirmed) {
      const snap = splitE164(bizConfirmed);
      setBizCountry(snap.country ?? DEFAULT_COUNTRY);
      setBizNational(snap.nationalDigits);
      setBizTouched(false);
    }
  }

  // O botão de confirmar só aparece quando há algo digitado (some quando vazio).
  const showPathConfirm = pathTrim.length > 0;
  const showBizConfirm = bizNational.length > 0;

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
      ? pathValid &&
        pathTrim === pathConfirmed &&
        (!isWhatsapp || (bizValid && businessIdDigits === bizConfirmed))
      : isValidUrl(targetUrl.trim()));

  // Salvar só habilita quando houve alteração de fato.
  const isDirty =
    name.trim() !== (webhook.name ?? "").trim() ||
    description.trim() !== (webhook.description ?? "").trim() ||
    arrKey(methods) !== arrKey(webhook.methods) ||
    (isInbound
      ? pathConfirmed !== (webhook.path ?? "").trim() ||
        (isWhatsapp && bizConfirmed !== initBizDigits)
      : targetUrl.trim() !== (webhook.targetUrl ?? "").trim() ||
        arrKey(events) !== arrKey(webhook.events ?? []));

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
            <div className="flex items-stretch">
              <div
                className={cn(
                  "flex h-9 flex-1 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors dark:bg-input/30",
                  showPathError
                    ? "border-destructive focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/40"
                    : "border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
                )}
              >
                <span className="flex items-center whitespace-nowrap bg-muted px-2.5 text-xs text-muted-foreground">
                  {inboundBaseUrl}
                </span>
                <div className="my-1.5 w-px shrink-0 bg-border" aria-hidden />
                <input
                  id="wh-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onBlur={revertPath}
                  placeholder={isWhatsapp ? "whatsapp/loja-matriz" : "meu-sistema/eventos"}
                  aria-invalid={showPathError}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div
                className={cn(
                  "flex items-stretch transition-all duration-200",
                  showPathConfirm ? "ml-2 w-9 opacity-100" : "ml-0 w-0 opacity-0",
                )}
              >
                <FieldValidateButton
                  variant={pathVariant}
                  onClick={confirmPath}
                  label="Confirmar endereço"
                />
              </div>
            </div>
            {showPathError ? (
              <p className="text-xs text-destructive" role="alert">
                {pathErrorMsg}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Você define o final do endereço. Apenas minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            )}
          </div>

          {isWhatsapp && (
            <div className="space-y-1.5">
              <Label htmlFor="wh-business">Número da empresa</Label>
              <div ref={bizFieldRef} className="flex items-stretch">
                <PhoneInput
                  className="flex-1"
                  country={bizCountry}
                  onCountryChange={setBizCountry}
                  national={bizNational}
                  onNationalChange={setBizNational}
                  onBlur={revertBiz}
                  invalid={showBizError}
                  inputId="wh-business"
                />
                <div
                  className={cn(
                    "flex items-stretch transition-all duration-200",
                    showBizConfirm ? "ml-2 w-9 opacity-100" : "ml-0 w-0 opacity-0",
                  )}
                >
                  <FieldValidateButton
                    variant={bizVariant}
                    onClick={confirmBiz}
                    label="Confirmar número"
                  />
                </div>
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
            <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/50 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
              <Lock className="h-3 w-3" strokeWidth={1.5} aria-hidden />
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
                    "group inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-600 hover:border-violet-500/70 hover:bg-violet-500/20 dark:text-violet-400"
                      : "border-border text-foreground hover:bg-accent",
                  )}
                >
                  {on ? (
                    <>
                      {/* Ativo: ✓ vira − ao passar o mouse (indica que vai desativar). */}
                      <Check className="h-3 w-3 group-hover:hidden" />
                      <Minus className="hidden h-3 w-3 group-hover:block" />
                    </>
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isWhatsapp && (
        <WhatsappInboundHelp inboundBaseUrl={inboundBaseUrl} path={pathConfirmed} defaultOpen={false} />
      )}

      {!isInbound && (
        <div className="space-y-2">
          <Label>Eventos</Label>
          <WebhookEventSelector value={events} onChange={setEvents} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Token de assinatura</p>
            <p className="text-xs text-muted-foreground">Gere um novo token e invalide o anterior.</p>
            <p className="text-xs text-muted-foreground">
              Token atual:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                {webhook.secretHint}
              </code>
            </p>
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
        <Button type="button" variant="outline" onClick={back} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || !valid || !isDirty}
          className="gap-1.5"
        >
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
