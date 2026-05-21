"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  rotateWebhookSecret,
  toggleWebhook,
  type WebhookListItem,
} from "@/lib/actions/webhooks";
import { cn } from "@/lib/utils";

interface Props {
  initial: WebhookListItem[];
}

const DIRECTION_LABELS: Record<string, string> = {
  inbound: "Entrada",
  outbound: "Saída",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function WebhooksContent({ initial }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Form de criação
  const [showForm, setShowForm] = useState(false);
  const [newDirection, setNewDirection] = useState<"inbound" | "outbound">("inbound");
  const [newUrl, setNewUrl] = useState("");

  // Revelação de secret após criação/rotação
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [showRevealedSecret, setShowRevealedSecret] = useState(false);

  async function refresh() {
    const result = await listWebhooks();
    if (result.success) setWebhooks(result.data);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // NOTA: esta tela é remodelada no Bloco J (passa a usar o WebhookWizard).
      // Aqui mantém-se uma chamada mínima compatível com a nova assinatura.
      const result = await createWebhook({
        direction: newDirection,
        name: newUrl.trim() || "Webhook",
        path: newDirection === "inbound" ? "webhook" : null,
        targetUrl: newDirection === "outbound" ? newUrl.trim() || null : null,
        methods: ["POST"],
      });
      if (result.success) {
        setRevealedSecret({ id: result.data.id, secret: result.data.secretPlain });
        setShowRevealedSecret(true);
        setShowForm(false);
        setNewUrl("");
        await refresh();
        toast.success("Webhook criado — copie o secret agora, ele não será exibido novamente");
      } else {
        toast.error(result.error ?? "Erro ao criar webhook");
      }
    });
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

  function handleRotate(id: string) {
    startTransition(async () => {
      const result = await rotateWebhookSecret(id);
      if (result.success) {
        setRevealedSecret({ id, secret: result.data.secretPlain });
        setShowRevealedSecret(true);
        toast.success("Secret rotacionado — copie o novo secret agora");
      } else {
        toast.error(result.error ?? "Erro ao rotacionar secret");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteWebhook(id);
      if (result.success) {
        await refresh();
        if (revealedSecret?.id === id) setRevealedSecret(null);
        toast.success("Webhook removido");
      } else {
        toast.error(result.error ?? "Erro ao remover webhook");
      }
    });
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret).then(() => {
      toast.success("Secret copiado");
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Banner de secret revelado */}
      {revealedSecret && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Secret gerado — copie agora
          </p>
          <p className="text-xs text-muted-foreground">
            Este secret não será exibido novamente após você fechar este aviso.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all">
              {showRevealedSecret ? revealedSecret.secret : "•".repeat(Math.min(revealedSecret.secret.length, 24))}
            </code>
            <Button
              variant="outline"
              size="sm"
              aria-label={showRevealedSecret ? "Ocultar secret" : "Mostrar secret"}
              onClick={() => setShowRevealedSecret((v) => !v)}
            >
              {showRevealedSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Copiar secret"
              onClick={() => copySecret(revealedSecret.secret)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Fechar aviso"
              onClick={() => setRevealedSecret(null)}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

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

      {/* Form de criação */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold">Criar webhook</p>

          <div className="space-y-2">
            <Label htmlFor="wh-direction">Direção</Label>
            <CustomSelect
              aria-label="Direção do webhook"
              value={newDirection}
              onChange={(v) => setNewDirection(v as "inbound" | "outbound")}
              triggerClassName="min-h-[44px]"
              options={[
                {
                  value: "inbound",
                  label: "Entrada",
                  description: "Receptor de mensagens",
                },
                {
                  value: "outbound",
                  label: "Saída",
                  description: "Callback do n8n",
                },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wh-url">URL (opcional)</Label>
            <Input
              id="wh-url"
              placeholder="https://n8n.example.com/webhook/..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Lista de webhooks */}
      <div data-tour="webhooks-lista" className="space-y-3">
        {webhooks.map((wh) => (
          <WebhookRow
            key={wh.id}
            webhook={wh}
            isPending={isPending}
            onToggle={handleToggle}
            onRotate={handleRotate}
            onDelete={handleDelete}
          />
        ))}
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
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
}

function WebhookRow({ webhook, isPending, onToggle, onRotate, onDelete }: WebhookRowProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 space-y-3 transition-colors hover:border-foreground/20",
        !webhook.enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Webhook className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              {webhook.enabled ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-semibold">
                {DIRECTION_LABELS[webhook.direction] ?? webhook.direction}
              </span>
            </div>
            {(webhook.targetUrl ?? webhook.path) && (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {webhook.targetUrl ?? webhook.path}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Criado em {formatDate(webhook.createdAt)}
            </p>
          </div>
        </div>

        {/* Toggle habilitado */}
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
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 border-t border-border/40 pt-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={isPending}
                onClick={() => onRotate(webhook.id)}
                aria-label="Rotacionar secret"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rotacionar secret
              </Button>
            }
          />
          <TooltipContent>Gerar novo secret HMAC e invalidar o anterior</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isPending}
                onClick={() => onDelete(webhook.id)}
                aria-label="Remover webhook"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            }
          />
          <TooltipContent>Excluir este webhook</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// Ícone de refresh para uso externo
export { RefreshCw };
