"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTour } from "@/components/tour/tour-provider";
import { webhookTour } from "@/lib/tours/webhook-tour";
import { WebhookWizard } from "@/components/integrations/webhook-wizard";
import { WebhookEditDialog } from "@/components/integracoes/webhook-edit-dialog";
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

export function WebhooksContent({ initial, inboundBaseUrl }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  // O assistente de criação é um modal. Durante o tour ele abre só no passo do
  // assistente (índice 1); nos passos do botão e da lista fica fechado.
  const { active, currentStepIndex } = useTour();
  const tourWizardOpen =
    active?.id === webhookTour.id && currentStepIndex === 1;

  // Assistente de criação
  const [showForm, setShowForm] = useState(false);
  const formVisible = showForm || tourWizardOpen;

  // Edição de webhook
  const [editTarget, setEditTarget] = useState<WebhookListItem | null>(null);

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
    <div className="space-y-6 max-w-3xl">
      {/* Cabeçalho com botão de criação */}
      <div data-tour="webhooks-novo" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {webhooks.length === 0
            ? "Nenhum webhook configurado"
            : `${webhooks.length} webhook${webhooks.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="h-9"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Novo webhook
        </Button>
      </div>

      {/* Assistente de criação, em modal */}
      <WebhookCreateDialog
        open={formVisible}
        onOpenChange={(o) => {
          setShowForm(o);
          // Fechar pelo X também atualiza a lista, mostrando o webhook novo.
          if (!o) {
            startTransition(async () => {
              await refresh();
            });
          }
        }}
        inboundBaseUrl={inboundBaseUrl}
        onCreated={() => {
          setShowForm(false);
          startTransition(async () => {
            await refresh();
          });
          toast.success("Webhook criado");
        }}
      />

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
              onEdit={() => setEditTarget(wh)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <WebhookEditDialog
        webhook={editTarget}
        open={editTarget != null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        onSaved={() => {
          setEditTarget(null);
          startTransition(async () => {
            await refresh();
          });
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// WebhookCreateDialog, assistente de criação em modal
// ──────────────────────────────────────────────────────────────────────────────

function WebhookCreateDialog({
  open,
  onOpenChange,
  inboundBaseUrl,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboundBaseUrl: string;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="webhook-wizard-modal" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo webhook</DialogTitle>
          <DialogDescription>
            Configure um webhook para receber ou enviar eventos de outros sistemas.
          </DialogDescription>
        </DialogHeader>
        <WebhookWizard embedded inboundBaseUrl={inboundBaseUrl} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// WebhookRow
// ──────────────────────────────────────────────────────────────────────────────

interface WebhookRowProps {
  webhook: WebhookListItem;
  isPending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

function WebhookRow({ webhook, isPending, onToggle, onEdit, onDelete }: WebhookRowProps) {
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
            </div>
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
                  disabled={isPending}
                  onClick={onEdit}
                  aria-label="Editar webhook"
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
