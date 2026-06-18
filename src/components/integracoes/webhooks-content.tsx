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
import { cn } from "@/lib/utils";

interface Props {
  initial: WebhookListItem[];
  /** URL base dos webhooks de entrada (`.../api/hooks/`). */
  inboundBaseUrl: string;
}

/** Rótulo da direção, em linguagem clara: escutar vs disparar. */
const DIRECTION_LABELS: Record<string, string> = {
  inbound: "Recebe eventos",
  outbound: "Envia eventos",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
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
  const DirIcon = isInbound ? ArrowDownToLine : ArrowUpFromLine;
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <DirIcon className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{webhook.name ?? "Webhook"}</span>
              <span className="text-[11px] text-muted-foreground">
                {DIRECTION_LABELS[webhook.direction] ?? webhook.direction}
              </span>
              {webhook.isWhatsappReceiver && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                  <MessageCircle className="h-2.5 w-2.5" aria-hidden />
                  WhatsApp{webhook.businessId ? ` · ${webhook.businessId}` : ""}
                </span>
              )}
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
            <p className="text-[11px] text-muted-foreground">
              Criado em {formatDate(webhook.createdAt)}
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
