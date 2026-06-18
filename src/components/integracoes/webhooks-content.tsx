"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteWebhook,
  listWebhooks,
  toggleWebhook,
  type WebhookListItem,
} from "@/lib/actions/webhooks";
import { formatE164ForDisplay } from "@/lib/whatsapp/countries";
import {
  webhookKindBadgeClass,
  webhookKindLabel,
  type WebhookKind,
} from "@/lib/integrations/webhook-kind";
import { cn } from "@/lib/utils";

/** Ícone e cores do card por tipo de webhook (mesma identidade da criação). */
const KIND_META: Record<WebhookKind, { icon: typeof ArrowDownToLine; iconColor: string; iconBg: string }> = {
  whatsapp: { icon: MessageCircle, iconColor: "text-green-500", iconBg: "bg-green-500/10" },
  inbound_generic: { icon: ArrowDownToLine, iconColor: "text-sky-500", iconBg: "bg-sky-500/10" },
  outbound: { icon: ArrowUpFromLine, iconColor: "text-violet-500", iconBg: "bg-violet-500/10" },
};

function webhookKindOf(webhook: WebhookListItem): WebhookKind {
  if (webhook.direction !== "inbound") return "outbound";
  return webhook.isWhatsappReceiver ? "whatsapp" : "inbound_generic";
}

interface Props {
  initial: WebhookListItem[];
  /** URL base dos webhooks de entrada (`.../api/hooks/`). */
  inboundBaseUrl: string;
}

function formatDateTime(date: Date) {
  const dt = new Date(date);
  const d = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(dt);
  const t = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(dt);
  return `${d} às ${t}`;
}

export function WebhooksContent({ initial }: Props) {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const result = await listWebhooks();
    if (result.success) setWebhooks(result.data);
  }

  function handleToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await toggleWebhook(id, enabled);
      if (result.success) {
        await refresh();
      } else {
        toast.error(result.error ?? "Erro ao atualizar webhook");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteWebhook(id);
      if (result.success) {
        await refresh();
        toast.success("Webhook removido");
      } else {
        toast.error(result.error ?? "Erro ao remover webhook");
      }
    });
  }

  return (
    <div className="space-y-6 ">
      {/* Cabeçalho com botão de criação (navega para a tela cheia) */}
      <div data-tour="webhooks-novo" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {webhooks.length === 0
            ? "Nenhum webhook configurado"
            : `${webhooks.length} webhook${webhooks.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() => router.push("/integracoes/webhooks/novo")}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Novo webhook
        </Button>
      </div>

      {/* Lista de webhooks */}
      <div data-tour="webhooks-lista" className="space-y-3">
        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
            <ArrowDownToLine className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum webhook configurado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Crie um webhook para receber ou enviar eventos de outros sistemas.
            </p>
          </div>
        ) : (
          webhooks.map((wh) => (
            <WebhookRow
              key={wh.id}
              webhook={wh}
              isPending={isPending}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// WebhookRow
// ──────────────────────────────────────────────────────────────────────────────

interface WebhookRowProps {
  webhook: WebhookListItem;
  isPending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

function WebhookRow({ webhook, isPending, onToggle, onDelete }: WebhookRowProps) {
  const router = useRouter();
  const isInbound = webhook.direction === "inbound";
  const kind = webhookKindOf(webhook);
  const km = KIND_META[kind];
  const KindIcon = km.icon;
  const isWhatsapp = kind === "whatsapp";
  const endpoint = isInbound
    ? webhook.path
      ? `/${webhook.path}`
      : null
    : webhook.targetUrl;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20",
        !webhook.enabled && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", km.iconBg)}>
            <KindIcon className={cn("h-4 w-4", km.iconColor)} />
          </span>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{webhook.name ?? "Webhook"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  webhookKindBadgeClass(kind),
                )}
              >
                {webhookKindLabel(kind)}
              </span>
            </div>
            {webhook.description && (
              <p className="text-[11px] text-muted-foreground">{webhook.description}</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {endpoint && (
                <code className="max-w-full truncate rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground">
                  {endpoint}
                </code>
              )}
              {webhook.methods.map((m) => (
                <span
                  key={m}
                  className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"
                >
                  {m}
                </span>
              ))}
            </div>
            {isWhatsapp && webhook.businessId && (
              <p className="text-[11px] text-muted-foreground">
                WhatsApp:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatE164ForDisplay(webhook.businessId)}
                </span>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Criado em {formatDateTime(webhook.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Switch
                  checked={webhook.enabled}
                  onCheckedChange={(v) => onToggle(webhook.id, v)}
                  disabled={isPending}
                  aria-label={webhook.enabled ? "Desabilitar webhook" : "Habilitar webhook"}
                />
              }
            />
            <TooltipContent>{webhook.enabled ? "Desabilitar" : "Habilitar"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Editar webhook"
                  onClick={() => router.push(`/integracoes/webhooks/${webhook.id}/editar`)}
                />
              }
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Editar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => onDelete(webhook.id)}
                  aria-label="Remover webhook"
                />
              }
            >
              <Trash2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Remover</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
