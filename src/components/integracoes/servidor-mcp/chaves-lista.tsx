"use client";

import { useState, useTransition, useId } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  XCircle,
  AlertTriangle,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import {
  listMcpApiKeys,
  createMcpApiKey,
  updateMcpApiKey,
  rotateMcpApiKey,
  revokeMcpApiKey,
  markLostAndRegenerate,
} from "@/lib/actions/mcp-api-keys";
import {
  MCP_MODULES,
  WRITE_ACTIONS,
  SENSITIVE_ACTIONS,
  type McpApiKeyListItem,
  type McpCapabilities,
  type McpModule,
  type WriteAction,
} from "@/lib/actions/mcp-api-keys-types";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatDatetime(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function capabilitiesSummary(cap: McpCapabilities): string {
  const readCount = cap.read.length;
  const writeModules = Object.keys(cap.write).length;
  const parts: string[] = [];
  if (readCount > 0) parts.push(`${readCount} módulo${readCount !== 1 ? "s" : ""} leitura`);
  if (writeModules > 0) parts.push(`${writeModules} módulo${writeModules !== 1 ? "s" : ""} escrita`);
  if (parts.length === 0) return "Sem capabilities";
  return parts.join(", ");
}

function emptyCapabilities(): McpCapabilities {
  return { version: 1, read: [], write: {} };
}

// ──────────────────────────────────────────────────────────────────────────────
// ChavesLista (L1)
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  initial: McpApiKeyListItem[];
}

export function ChavesLista({ initial }: Props) {
  const [keys, setKeys] = useState<McpApiKeyListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Dialogs state
  const [novaChaveOpen, setNovaChaveOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<{ token: string; label: string } | null>(null);
  const [editTarget, setEditTarget] = useState<McpApiKeyListItem | null>(null);

  async function refresh() {
    const r = await listMcpApiKeys();
    if (r.success) setKeys(r.data);
  }

  // ── Banner de system keys sem capabilities ──────────────────────────────
  const systemKeysNeedingReconfig = keys.filter(
    (k) => k.isSystemKey && k.capabilities.read.length === 0 && Object.keys(k.capabilities.write).length === 0,
  );

  const activeKeys = keys.filter((k) => k.active && !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Banner system keys */}
      {systemKeysNeedingReconfig.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {systemKeysNeedingReconfig.length} chave{systemKeysNeedingReconfig.length !== 1 ? "s" : ""} herdada{systemKeysNeedingReconfig.length !== 1 ? "s" : ""} precisam de reconfiguração
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estas chaves de sistema não possuem capabilities configuradas e podem não funcionar corretamente.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeKeys.length === 0
            ? "Nenhuma chave ativa"
            : `${activeKeys.length} chave${activeKeys.length !== 1 ? "s" : ""} ativa${activeKeys.length !== 1 ? "s" : ""}`}
        </p>
        <Button type="button" size="sm" onClick={() => setNovaChaveOpen(true)} className="h-9">
          <Plus className="mr-1.5 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      {/* Active keys */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          {activeKeys.map((k) => (
            <ChaveRow
              key={k.id}
              chave={k}
              isPending={isPending}
              onEdit={() => setEditTarget(k)}
              onRotate={() => {
                startTransition(async () => {
                  const r = await rotateMcpApiKey(k.id);
                  if (r.success) {
                    setRevealToken({ token: r.data.token, label: r.data.label });
                    await refresh();
                    toast.success("Chave rotacionada — copie o novo token");
                  } else {
                    toast.error(r.error ?? "Erro ao rotacionar chave");
                  }
                });
              }}
              onRevoke={() => {
                startTransition(async () => {
                  const r = await revokeMcpApiKey(k.id);
                  if (r.success) {
                    await refresh();
                    toast.success("Chave revogada");
                  } else {
                    toast.error(r.error ?? "Erro ao revogar chave");
                  }
                });
              }}
              onMarkLost={() => {
                startTransition(async () => {
                  const r = await markLostAndRegenerate(k.id);
                  if (r.success) {
                    setRevealToken({ token: r.data.token, label: r.data.label });
                    await refresh();
                    toast.success("Chave antiga revogada, nova gerada");
                  } else {
                    toast.error(r.error ?? "Erro ao regenerar chave");
                  }
                });
              }}
            />
          ))}
        </div>
      )}

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Revogadas
          </p>
          <div className="space-y-2">
            {revokedKeys.map((k) => (
              <ChaveRow key={k.id} chave={k} isPending={isPending} revoked />
            ))}
          </div>
        </div>
      )}

      {/* Nova Chave Dialog */}
      <NovaChaveDialog
        open={novaChaveOpen}
        onClose={() => setNovaChaveOpen(false)}
        onCreated={(token, label) => {
          setRevealToken({ token, label });
          setNovaChaveOpen(false);
          startTransition(async () => { await refresh(); });
        }}
      />

      {/* Token Reveal Dialog */}
      {revealToken && (
        <TokenRevealDialog
          token={revealToken.token}
          label={revealToken.label}
          onClose={() => setRevealToken(null)}
        />
      )}

      {/* Editar Chave Dialog */}
      {editTarget && (
        <EditarChaveDialog
          chave={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ChaveRow
// ──────────────────────────────────────────────────────────────────────────────

interface ChaveRowProps {
  chave: McpApiKeyListItem;
  isPending?: boolean;
  revoked?: boolean;
  onEdit?: () => void;
  onRotate?: () => void;
  onRevoke?: () => void;
  onMarkLost?: () => void;
}

function ChaveRow({ chave, isPending, revoked, onEdit, onRotate, onRevoke, onMarkLost }: ChaveRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const capSummary = capabilitiesSummary(chave.capabilities);

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
            <div className="flex items-center gap-2 flex-wrap">
              {revoked ? (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              <span className="text-sm font-semibold">{chave.label}</span>
              {chave.isSystemKey && (
                <Badge variant="outline" className="text-[10px]">Sistema</Badge>
              )}
              {chave.tenantId && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Tenant</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">••••••••{chave.last4}</p>
            <p className="text-[11px] text-muted-foreground">{capSummary}</p>
            {chave.lastUsedAt && (
              <p className="text-[11px] text-muted-foreground">
                Usado em {formatDatetime(chave.lastUsedAt)}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {revoked
                ? `Revogada em ${formatDate(chave.revokedAt!)}`
                : `Criada em ${formatDate(chave.createdAt)}`}
            </p>
            {chave.expiresAt && !revoked && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Expira em {formatDate(chave.expiresAt)}
              </p>
            )}
          </div>
        </div>

        {!revoked && (
          <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Popover.Trigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 w-8 p-0"
                  aria-label="Ações da chave"
                  disabled={isPending}
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="end" sideOffset={4}>
                <Popover.Popup className="z-50 min-w-[160px] rounded-xl border border-border bg-popover p-1 shadow-md text-sm text-popover-foreground outline-none">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setMenuOpen(false); onEdit?.(); }}
                  >
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Editar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setMenuOpen(false); onRotate?.(); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    Rotacionar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setMenuOpen(false); onMarkLost?.(); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    Marcar perdida e regenerar
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => { setMenuOpen(false); onRevoke?.(); }}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Revogar
                  </button>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CapabilitiesMatrix
// ──────────────────────────────────────────────────────────────────────────────

interface CapabilitiesMatrixProps {
  value: McpCapabilities;
  onChange: (v: McpCapabilities) => void;
}

function CapabilitiesMatrix({ value, onChange }: CapabilitiesMatrixProps) {
  // Confirmation for sensitive actions
  const [confirmPending, setConfirmPending] = useState<{ module: McpModule; action: WriteAction } | null>(null);

  function toggleRead(module: McpModule) {
    const has = value.read.includes(module);
    onChange({
      ...value,
      read: has ? value.read.filter((m) => m !== module) : [...value.read, module],
    });
  }

  function requestWriteToggle(module: McpModule, action: WriteAction) {
    const currentActions = value.write[module] ?? [];
    const has = currentActions.includes(action);
    if (!has && SENSITIVE_ACTIONS.includes(action)) {
      // Exige confirmação dupla
      setConfirmPending({ module, action });
      return;
    }
    applyWriteToggle(module, action);
  }

  function applyWriteToggle(module: McpModule, action: WriteAction) {
    const currentActions = value.write[module] ?? [];
    const has = currentActions.includes(action);
    const newActions = has
      ? currentActions.filter((a) => a !== action)
      : [...currentActions, action];
    const newWrite = { ...value.write };
    if (newActions.length === 0) {
      delete newWrite[module];
    } else {
      newWrite[module] = newActions;
    }
    onChange({ ...value, write: newWrite });
  }

  return (
    <div className="space-y-3">
      {/* Confirmation dialog for sensitive actions */}
      {confirmPending && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Ação sensível: {confirmPending.action} em {confirmPending.module}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta ação permite que a chave execute operações irreversíveis ou de transição de estado. Confirme para continuar.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => {
                applyWriteToggle(confirmPending.module, confirmPending.action);
                setConfirmPending(null);
              }}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setConfirmPending(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Módulo</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Leitura</th>
              {WRITE_ACTIONS.map((a) => (
                <th
                  key={a}
                  className={cn(
                    "py-2 px-2 text-center font-medium",
                    SENSITIVE_ACTIONS.includes(a)
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {a}
                  {SENSITIVE_ACTIONS.includes(a) && (
                    <span title="Ação sensível" className="ml-1 text-amber-500">⚠</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MCP_MODULES.map((mod, i) => (
              <tr
                key={mod}
                className={cn(
                  "border-b border-border last:border-0",
                  i % 2 === 0 ? "bg-background/40" : "bg-muted/10",
                )}
              >
                <td className="py-2 px-3 font-mono font-medium">{mod}</td>
                <td className="py-2 px-2 text-center">
                  <Checkbox
                    checked={value.read.includes(mod)}
                    onCheckedChange={() => toggleRead(mod)}
                    aria-label={`Leitura ${mod}`}
                  />
                </td>
                {WRITE_ACTIONS.map((action) => (
                  <td key={action} className="py-2 px-2 text-center">
                    <Checkbox
                      checked={(value.write[mod] ?? []).includes(action)}
                      onCheckedChange={() => requestWriteToggle(mod, action)}
                      aria-label={`${action} ${mod}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// NovaChaveDialog (L3)
// ──────────────────────────────────────────────────────────────────────────────

interface NovaChaveDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (token: string, label: string) => void;
}

function NovaChaveDialog({ open, onClose, onCreated }: NovaChaveDialogProps) {
  const labelId = useId();
  const descId = useId();
  const tenantId = useId();
  const rateLimitId = useId();

  const [isPending, startTransition] = useTransition();

  // Form state
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tenant, setTenant] = useState("");
  const [capabilities, setCapabilities] = useState<McpCapabilities>(emptyCapabilities());
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState("");
  const [allowedOrigins, setAllowedOrigins] = useState("");

  function reset() {
    setLabel("");
    setDescription("");
    setTenant("");
    setCapabilities(emptyCapabilities());
    setRateLimit(60);
    setExpiresAt("");
    setAllowedOrigins("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const origins = allowedOrigins
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const r = await createMcpApiKey({
        label: label.trim(),
        description: description.trim() || undefined,
        tenantId: tenant.trim() || null,
        capabilities,
        rateLimit,
        expiresAt: expiresAt || null,
        allowedOrigins: origins,
      });

      if (r.success) {
        reset();
        onCreated(r.data.token, r.data.label);
        toast.success("Chave MCP criada — copie o token agora");
      } else {
        toast.error(r.error ?? "Erro ao criar chave");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova chave de acesso MCP</DialogTitle>
          <DialogDescription>
            Configure o escopo de acesso, rate limit e expiração. O token será exibido uma única vez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor={labelId}>Rótulo *</Label>
            <Input
              id={labelId}
              placeholder="Ex: n8n produção, agente WhatsApp..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor={descId}>Descrição</Label>
            <Textarea
              id={descId}
              placeholder="Descreva o uso desta chave (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Tenant */}
          <div className="space-y-1.5">
            <Label htmlFor={tenantId}>Tenant ID (opcional)</Label>
            <Input
              id={tenantId}
              placeholder="UUID do tenant ou deixe vazio para acesso global"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Quando preenchido, a chave só acessa dados do tenant especificado.
            </p>
          </div>

          {/* Capabilities matrix */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Capabilities</Label>
            <p className="text-xs text-muted-foreground">
              Marque os módulos e ações que esta chave pode executar. Ações marcadas com ⚠ exigem confirmação.
            </p>
            <CapabilitiesMatrix value={capabilities} onChange={setCapabilities} />
          </div>

          {/* Rate limit */}
          <div className="space-y-1.5">
            <Label htmlFor={rateLimitId}>
              Rate limit — {rateLimit} req/min
            </Label>
            <input
              id={rateLimitId}
              type="range"
              min={1}
              max={600}
              step={1}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1 req/min</span>
              <span>600 req/min</span>
            </div>
          </div>

          {/* Expiração */}
          <div className="space-y-1.5">
            <Label htmlFor="nova-expires">Expiração (opcional)</Label>
            <Input
              id="nova-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </div>

          {/* Allowed origins */}
          <div className="space-y-1.5">
            <Label htmlFor="nova-origins">Origens permitidas (opcional)</Label>
            <Textarea
              id="nova-origins"
              placeholder={"https://app.exemplo.com\nhttps://n8n.exemplo.com"}
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Uma URL por linha. Deixe em branco para permitir qualquer origem.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !label.trim()} className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar chave
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// TokenRevealDialog (L4)
// ──────────────────────────────────────────────────────────────────────────────

interface TokenRevealDialogProps {
  token: string;
  label: string;
  onClose: () => void;
}

function TokenRevealDialog({ token, label, onClose }: TokenRevealDialogProps) {
  const [showToken, setShowToken] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const confirmId = useId();

  function handleCopy() {
    navigator.clipboard.writeText(token).then(() => {
      toast.success("Token copiado para a área de transferência");
    });
  }

  return (
    <Dialog open onOpenChange={() => { /* não-dismissível */ }}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-violet-500" />
            Token da chave — copie agora
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{label}</span> — este token não será exibido novamente. Guarde em local seguro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-start gap-2">
            <code
              className={cn(
                "flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm font-mono break-all leading-relaxed",
                !showToken && "select-none blur-sm",
              )}
            >
              {token}
            </code>
            <div className="flex flex-col gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                      onClick={() => setShowToken((v) => !v)}
                    >
                      {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  }
                />
                <TooltipContent>{showToken ? "Ocultar" : "Mostrar"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      aria-label="Copiar token"
                      onClick={handleCopy}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
                <TooltipContent>Copiar</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Este é o único momento em que o token é exibido. Após fechar esta janela, não é possível recuperá-lo — será necessário rotacionar a chave.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={confirmId}
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(Boolean(v))}
            />
            <label
              htmlFor={confirmId}
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Marquei e copiei o token em local seguro
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!confirmed}
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// EditarChaveDialog (L5.5)
// ──────────────────────────────────────────────────────────────────────────────

interface EditarChaveDialogProps {
  chave: McpApiKeyListItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function EditarChaveDialog({ chave, onClose, onSaved }: EditarChaveDialogProps) {
  const [isPending, startTransition] = useTransition();
  const labelId = useId();
  const descId = useId();
  const rateLimitId = useId();

  const [label, setLabel] = useState(chave.label);
  const [description, setDescription] = useState(chave.description ?? "");
  const [capabilities, setCapabilities] = useState<McpCapabilities>(chave.capabilities);
  const [rateLimit, setRateLimit] = useState(chave.rateLimit);
  const [allowedOrigins, setAllowedOrigins] = useState(chave.allowedOrigins.join("\n"));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const origins = allowedOrigins
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const r = await updateMcpApiKey(chave.id, {
        label: label.trim(),
        description: description.trim() || null,
        capabilities,
        rateLimit,
        allowedOrigins: origins,
      });

      if (r.success) {
        await onSaved();
        toast.success("Chave atualizada");
      } else {
        toast.error(r.error ?? "Erro ao atualizar chave");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar chave — {chave.label}</DialogTitle>
          <DialogDescription>
            Altere capabilities, rate limit ou origens. O token não é afetado — use "Rotacionar" para gerar um novo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor={labelId}>Rótulo *</Label>
            <Input
              id={labelId}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={descId}>Descrição</Label>
            <Textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Capabilities</Label>
            <CapabilitiesMatrix value={capabilities} onChange={setCapabilities} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={rateLimitId}>
              Rate limit — {rateLimit} req/min
            </Label>
            <input
              id={rateLimitId}
              type="range"
              min={1}
              max={600}
              step={1}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-origins">Origens permitidas</Label>
            <Textarea
              id="edit-origins"
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              rows={3}
              placeholder={"https://app.exemplo.com\nhttps://n8n.exemplo.com"}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !label.trim()} className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
