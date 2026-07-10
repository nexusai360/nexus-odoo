"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyListItem,
} from "@/lib/actions/api-keys";
import { cn } from "@/lib/utils";

interface Props {
  initial: ApiKeyListItem[];
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function ApiKeysContent({ initial }: Props) {
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Form de criação
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  // Dialogo de chave revelada (exibe a key 1×)
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(false);

  async function refresh() {
    const result = await listApiKeys();
    if (result.success) setKeys(result.data);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKey(newLabel.trim(), ["agent:query"]);
      if (result.success) {
        setRevealedKey(result.data.key);
        setShowRevealedKey(true);
        setShowForm(false);
        setNewLabel("");
        await refresh();
        toast.success("API key criada , copie agora, não será exibida novamente");
      } else {
        toast.error(result.error ?? "Erro ao criar API key");
      }
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeApiKey(id);
      if (result.success) {
        await refresh();
        toast.success("API key revogada");
      } else {
        toast.error(result.error ?? "Erro ao revogar API key");
      }
    });
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => {
      toast.success("API key copiada");
    });
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-6 ">
      {/* Banner de key revelada */}
      {revealedKey && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            API key criada , copie agora
          </p>
          <p className="text-xs text-muted-foreground">
            Esta chave não será exibida novamente. Guarde em local seguro.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all">
              {showRevealedKey ? revealedKey : "•".repeat(Math.min(revealedKey.length, 32))}
            </code>
            <Button
              variant="outline"
              size="sm"
              aria-label={showRevealedKey ? "Ocultar chave" : "Mostrar chave"}
              onClick={() => setShowRevealedKey((v) => !v)}
            >
              {showRevealedKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Copiar API key"
              onClick={() => copyKey(revealedKey)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Fechar aviso"
              onClick={() => setRevealedKey(null)}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeKeys.length === 0
            ? "Nenhuma API key ativa"
            : `${activeKeys.length} key${activeKeys.length !== 1 ? "s" : ""} ativa${activeKeys.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="h-9"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova API key
        </Button>
      </div>

      {/* Form de criação */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold">Criar API key</p>

          <div className="space-y-2">
            <Label htmlFor="key-label">Rótulo</Label>
            <Input
              id="key-label"
              placeholder="Ex: automação de produção, integração externa..."
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Identifique onde esta key será usada. Escopo padrão: <code>agent:query</code>.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending || !newLabel.trim()} className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar key
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

      {/* Keys ativas */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          {activeKeys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              isPending={isPending}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}

      {/* Keys revogadas */}
      {revokedKeys.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Revogadas
          </p>
          <div className="space-y-2">
            {revokedKeys.map((key) => (
              <ApiKeyRow
                key={key.id}
                apiKey={key}
                isPending={isPending}
                onRevoke={handleRevoke}
                revoked
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ApiKeyRow
// ──────────────────────────────────────────────────────────────────────────────

interface ApiKeyRowProps {
  apiKey: ApiKeyListItem;
  isPending: boolean;
  onRevoke: (id: string) => void;
  revoked?: boolean;
}

function ApiKeyRow({ apiKey, isPending, onRevoke, revoked }: ApiKeyRowProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:border-foreground/20",
        revoked && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Key className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              {revoked ? (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              <span className="text-sm font-semibold">{apiKey.label}</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              ••••••••{apiKey.last4}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(apiKey.scopes as string[]).map((scope) => (
                <span
                  key={scope}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 font-mono"
                >
                  {scope}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {revoked
                ? `Revogada em ${formatDate(apiKey.revokedAt!)}`
                : `Criada em ${formatDate(apiKey.createdAt)}`}
            </p>
          </div>
        </div>

        {!revoked && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => onRevoke(apiKey.id)}
                  aria-label="Revogar API key"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Revogar
                </Button>
              }
            />
            <TooltipContent>
              Invalida a chave imediatamente , não pode ser desfeito
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
