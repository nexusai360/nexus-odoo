"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecretRevealStep } from "@/components/ui/secret-reveal-step";
import { cn } from "@/lib/utils";
import {
  updateWebhook,
  rotateWebhookSecret,
  type WebhookListItem,
  type WebhookMethod,
} from "@/lib/actions/webhooks";

const HTTP_METHODS: WebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/;

interface Props {
  webhook: WebhookListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Modal de edição de webhook: altera nome, métodos e caminho/URL, com checagem
 * de caminho único na Server Action. A direção não é editável. A rotação de
 * secret revela o novo segredo dentro do próprio modal.
 */
export function WebhookEditDialog({ webhook, open, onOpenChange, onSaved }: Props) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [methods, setMethods] = useState<WebhookMethod[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hidrata ao abrir, uma vez por webhook alvo.
  if (open && webhook && hydratedFor !== webhook.id) {
    setName(webhook.name ?? "");
    setPath(webhook.path ?? "");
    setTargetUrl(webhook.targetUrl ?? "");
    setMethods(webhook.methods as WebhookMethod[]);
    setRevealedSecret(null);
    setHydratedFor(webhook.id);
  }
  if (!open && hydratedFor !== null) {
    setHydratedFor(null);
  }

  if (!webhook) return null;
  const isInbound = webhook.direction === "inbound";

  function handleRotate() {
    if (!webhook) return;
    startTransition(async () => {
      const r = await rotateWebhookSecret(webhook.id);
      if (r.success) {
        setRevealedSecret(r.data.secretPlain);
      } else {
        toast.error(r.error ?? "Erro ao rotacionar secret");
      }
    });
  }

  function toggleMethod(m: WebhookMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  const valid =
    name.trim().length > 0 &&
    methods.length > 0 &&
    (isInbound ? PATH_RE.test(path.trim()) : isValidUrl(targetUrl.trim()));

  function handleSave() {
    if (!webhook) return;
    startTransition(async () => {
      const r = await updateWebhook(webhook.id, {
        name: name.trim(),
        path: isInbound ? path.trim() : null,
        targetUrl: isInbound ? null : targetUrl.trim(),
        methods,
      });
      if (r.success) {
        onSaved();
        toast.success("Webhook atualizado");
      } else {
        toast.error(r.error ?? "Erro ao atualizar webhook");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar webhook</DialogTitle>
          <DialogDescription>
            {isInbound
              ? "Webhook de entrada: a plataforma escuta este caminho."
              : "Webhook de saída: a plataforma dispara para esta URL."}
          </DialogDescription>
        </DialogHeader>

        {revealedSecret ? (
          <div className="space-y-4">
            <SecretRevealStep
              secret={revealedSecret}
              label="Secret do webhook"
              onAcknowledge={() => setRevealedSecret(null)}
            />
          </div>
        ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-edit-name">Nome</Label>
            <Input
              id="wh-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Receptor do WhatsApp"
            />
          </div>

          {isInbound ? (
            <div className="space-y-1.5">
              <Label htmlFor="wh-edit-path">Caminho</Label>
              <Input
                id="wh-edit-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="whatsapp/inbound"
                aria-invalid={path.length > 0 && !PATH_RE.test(path.trim())}
              />
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="wh-edit-url">URL de destino</Label>
              <Input
                id="wh-edit-url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://exemplo.com/webhook/abc"
                aria-invalid={targetUrl.length > 0 && !isValidUrl(targetUrl.trim())}
              />
            </div>
          )}

          <div className="space-y-1.5">
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

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Secret de assinatura</p>
                <p className="text-xs text-muted-foreground">
                  Gere um novo secret e invalide o anterior.
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
        </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          {revealedSecret ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || !valid}
                className="gap-1.5"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar alterações
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
