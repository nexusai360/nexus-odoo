"use client";

import { useState, useTransition, useId } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Edit2,
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
// ChavesLista — lista + form inline (criar/editar) + banner de token revelado
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  initial: McpApiKeyListItem[];
}

type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; chave: McpApiKeyListItem };

export function ChavesLista({ initial }: Props) {
  const [keys, setKeys] = useState<McpApiKeyListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<FormMode>({ kind: "closed" });
  const [revealToken, setRevealToken] = useState<{ token: string; label: string } | null>(null);
  const [showToken, setShowToken] = useState(false);

  async function refresh() {
    const r = await listMcpApiKeys();
    if (r.success) setKeys(r.data);
  }

  const systemKeysNeedingReconfig = keys.filter(
    (k) =>
      k.isSystemKey &&
      k.capabilities.read.length === 0 &&
      Object.keys(k.capabilities.write).length === 0,
  );
  const activeKeys = keys.filter((k) => k.active && !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => toast.success("Token copiado"));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Banner de token revelado — exibido 1× */}
      {revealToken && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Token gerado — copie agora
          </p>
          <p className="text-xs text-muted-foreground">
            Chave <span className="font-medium text-foreground">{revealToken.label}</span> — este
            token não será exibido novamente. Após fechar, será preciso rotacionar a chave.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all">
              {showToken
                ? revealToken.token
                : "•".repeat(Math.min(revealToken.token.length, 32))}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              aria-label={showToken ? "Ocultar token" : "Mostrar token"}
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              aria-label="Copiar token"
              onClick={() => copyToken(revealToken.token)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              aria-label="Fechar aviso"
              onClick={() => {
                setRevealToken(null);
                setShowToken(false);
              }}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Banner system keys sem capabilities */}
      {systemKeysNeedingReconfig.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {systemKeysNeedingReconfig.length} chave
              {systemKeysNeedingReconfig.length !== 1 ? "s" : ""} herdada
              {systemKeysNeedingReconfig.length !== 1 ? "s" : ""} sem capabilities
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estas chaves de sistema não têm capabilities configuradas — edite-as para definir o escopo.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeKeys.length === 0
            ? "Nenhuma chave ativa"
            : `${activeKeys.length} chave${activeKeys.length !== 1 ? "s" : ""} ativa${activeKeys.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() =>
            setForm((f) => (f.kind === "create" ? { kind: "closed" } : { kind: "create" }))
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      {/* Form inline — criar */}
      {form.kind === "create" && (
        <ChaveForm
          mode="create"
          onClose={() => setForm({ kind: "closed" })}
          onCreated={(token, label) => {
            setRevealToken({ token, label });
            setShowToken(false);
            setForm({ kind: "closed" });
            startTransition(async () => {
              await refresh();
            });
          }}
        />
      )}

      {/* Lista de chaves ativas */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          {activeKeys.map((k) => (
            <div key={k.id} className="space-y-3">
              <ChaveRow
                chave={k}
                isPending={isPending}
                onEdit={() => setForm({ kind: "edit", chave: k })}
                onRotate={() => {
                  startTransition(async () => {
                    const r = await rotateMcpApiKey(k.id);
                    if (r.success) {
                      setRevealToken({ token: r.data.token, label: r.data.label });
                      setShowToken(false);
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
                      setShowToken(false);
                      await refresh();
                      toast.success("Chave antiga revogada, nova gerada");
                    } else {
                      toast.error(r.error ?? "Erro ao regenerar chave");
                    }
                  });
                }}
              />
              {/* Form inline — editar (logo abaixo da linha alvo) */}
              {form.kind === "edit" && form.chave.id === k.id && (
                <ChaveForm
                  mode="edit"
                  chave={k}
                  onClose={() => setForm({ kind: "closed" })}
                  onSaved={() => {
                    setForm({ kind: "closed" });
                    startTransition(async () => {
                      await refresh();
                    });
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chaves revogadas */}
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
                <Badge variant="outline" className="text-[10px]">
                  Sistema
                </Badge>
              )}
              {chave.tenantId && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Tenant
                </Badge>
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
                <Popover.Popup className="z-50 min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-md text-sm text-popover-foreground outline-none">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit?.();
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Editar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      onRotate?.();
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    Rotacionar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      onMarkLost?.();
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    Marcar perdida e regenerar
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      onRevoke?.();
                    }}
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
// CapabilitiesMatrix — grade módulo × ação, cabe em max-w-3xl sem scroll horizontal
// ──────────────────────────────────────────────────────────────────────────────

function CapabilitiesMatrix({
  value,
  onChange,
}: {
  value: McpCapabilities;
  onChange: (v: McpCapabilities) => void;
}) {
  const [confirmPending, setConfirmPending] = useState<{
    module: McpModule;
    action: WriteAction;
  } | null>(null);

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
      {confirmPending && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Ação sensível: {confirmPending.action} em {confirmPending.module}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Permite que a chave execute operações irreversíveis ou de transição de estado.
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

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Módulo</th>
              <th className="py-2 px-1 text-center font-medium text-muted-foreground">Leitura</th>
              {WRITE_ACTIONS.map((a) => (
                <th
                  key={a}
                  className={cn(
                    "py-2 px-1 font-medium",
                    SENSITIVE_ACTIONS.includes(a)
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="inline-flex items-center justify-center gap-0.5">
                    {a}
                    {SENSITIVE_ACTIONS.includes(a) && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <AlertTriangle
                              className="h-3 w-3 text-amber-500"
                              aria-label="Ação sensível"
                            />
                          }
                        />
                        <TooltipContent>Ação sensível — exige confirmação</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
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
                <td className="py-2 px-1 text-center">
                  <Checkbox
                    checked={value.read.includes(mod)}
                    onCheckedChange={() => toggleRead(mod)}
                    aria-label={`Leitura ${mod}`}
                  />
                </td>
                {WRITE_ACTIONS.map((action) => (
                  <td key={action} className="py-2 px-1 text-center">
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
// ChaveForm — form inline compartilhado entre criar e editar
// ──────────────────────────────────────────────────────────────────────────────

type ChaveFormProps =
  | {
      mode: "create";
      chave?: undefined;
      onClose: () => void;
      onCreated: (token: string, label: string) => void;
      onSaved?: undefined;
    }
  | {
      mode: "edit";
      chave: McpApiKeyListItem;
      onClose: () => void;
      onCreated?: undefined;
      onSaved: () => void;
    };

function ChaveForm(props: ChaveFormProps) {
  const { mode, chave, onClose } = props;
  const labelId = useId();
  const descId = useId();
  const tenantId = useId();
  const rateLimitId = useId();
  const expiresId = useId();
  const originsId = useId();

  const [isPending, startTransition] = useTransition();

  const [label, setLabel] = useState(chave?.label ?? "");
  const [description, setDescription] = useState(chave?.description ?? "");
  const [tenant, setTenant] = useState(chave?.tenantId ?? "");
  const [capabilities, setCapabilities] = useState<McpCapabilities>(
    chave?.capabilities ?? emptyCapabilities(),
  );
  const [rateLimit, setRateLimit] = useState(chave?.rateLimit ?? 60);
  const [expiresAt, setExpiresAt] = useState(
    chave?.expiresAt ? new Date(chave.expiresAt).toISOString().slice(0, 10) : "",
  );
  const [allowedOrigins, setAllowedOrigins] = useState(
    (chave?.allowedOrigins ?? []).join("\n"),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const origins = allowedOrigins
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (mode === "create") {
        const r = await createMcpApiKey({
          label: label.trim(),
          description: description.trim() || undefined,
          tenantId: tenant.trim() || null,
          capabilities,
          rateLimit,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          allowedOrigins: origins,
        });
        if (r.success) {
          props.onCreated(r.data.token, r.data.label);
          toast.success("Chave MCP criada — copie o token agora");
        } else {
          toast.error(r.error ?? "Erro ao criar chave");
        }
      } else {
        const r = await updateMcpApiKey(chave!.id, {
          label: label.trim(),
          description: description.trim() || null,
          capabilities,
          rateLimit,
          allowedOrigins: origins,
        });
        if (r.success) {
          props.onSaved();
          toast.success("Chave atualizada");
        } else {
          toast.error(r.error ?? "Erro ao atualizar chave");
        }
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <p className="text-sm font-semibold">
        {mode === "create" ? "Criar chave de acesso" : `Editar chave — ${chave!.label}`}
      </p>

      <div className="space-y-2">
        <Label htmlFor={labelId}>Rótulo *</Label>
        <Input
          id={labelId}
          placeholder="Ex: n8n produção, integração externa..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={descId}>Descrição</Label>
        <Input
          id={descId}
          placeholder="Onde esta chave será usada (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor={tenantId}>Tenant ID</Label>
          <Input
            id={tenantId}
            placeholder="UUID do tenant — vazio = acesso global"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Quando preenchido, a chave só acessa dados do tenant especificado.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={rateLimitId}>Rate limit</Label>
        <Input
          id={rateLimitId}
          type="number"
          min={1}
          max={600}
          value={rateLimit}
          onChange={(e) => setRateLimit(Number(e.target.value) || 1)}
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">Chamadas por minuto (1–600). Padrão: 60.</p>
      </div>

      <div className="space-y-2">
        <Label>Capabilities</Label>
        <p className="text-xs text-muted-foreground">
          Marque os módulos e ações que esta chave pode executar. Ações sensíveis exigem confirmação.
        </p>
        <CapabilitiesMatrix value={capabilities} onChange={setCapabilities} />
      </div>

      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor={expiresId}>Expiração</Label>
          <Input
            id={expiresId}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">Vazio = chave permanente.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={originsId}>Origens permitidas</Label>
        <Textarea
          id={originsId}
          placeholder={"https://app.exemplo.com\nhttps://n8n.exemplo.com"}
          value={allowedOrigins}
          onChange={(e) => setAllowedOrigins(e.target.value)}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Uma URL por linha. Vazio = qualquer origem.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !label.trim()} className="gap-1.5">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {mode === "create" ? "Criar chave" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
