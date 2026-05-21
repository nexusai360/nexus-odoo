"use client";

import { useState, useTransition, useId } from "react";
import {
  AlertTriangle,
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
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomSelect } from "@/components/ui/custom-select";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  capabilitiesToLevels,
  levelsToCapabilities,
  emptyAccessMap,
  type AccessLevel,
  type ModuleAccessMap,
} from "@/lib/mcp-capability-levels";

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
  if (readCount > 0) parts.push(`${readCount} de leitura`);
  if (writeModules > 0) parts.push(`${writeModules} de escrita`);
  if (parts.length === 0) return "Sem acessos definidos";
  return `Acesso a ${parts.join(", ")}`;
}

/** Asterisco vermelho para campo obrigatório, padrão do sistema. */
function RequiredMark() {
  return <span className="text-red-500"> *</span>;
}

const MODULE_LABELS: Record<McpModule, string> = {
  crm: "CRM",
  vendas: "Vendas",
  estoque: "Estoque",
  compras: "Compras",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  contabil: "Contábil",
  producao: "Produção",
  rh: "RH",
  projeto: "Projeto",
};

/** Rótulos humanizados das ações de escrita (o banco guarda em inglês). */
const WRITE_ACTION_LABELS: Record<WriteAction, string> = {
  Create: "Criar",
  Update: "Atualizar",
  Delete: "Excluir",
  Transition: "Mover",
};

// ──────────────────────────────────────────────────────────────────────────────
// ChavesLista
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  initial: McpApiKeyListItem[];
}

export function ChavesLista({ initial }: Props) {
  const [keys, setKeys] = useState<McpApiKeyListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<McpApiKeyListItem | null>(null);
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
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => toast.success("Token copiado"));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Banner de token revelado */}
      {revealToken && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Token gerado, copie agora
          </p>
          <p className="text-xs text-muted-foreground">
            Chave <span className="font-medium text-foreground">{revealToken.label}</span>. Este
            token não será exibido novamente. Depois de fechar, será preciso rotacionar a chave.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all">
              {showToken ? revealToken.token : "•".repeat(Math.min(revealToken.token.length, 32))}
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

      {/* Banner de chaves de sistema sem capabilities */}
      {systemKeysNeedingReconfig.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {systemKeysNeedingReconfig.length} chave
              {systemKeysNeedingReconfig.length !== 1 ? "s" : ""} de sistema sem acessos
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Edite a chave para definir o que ela pode fazer em cada módulo.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div data-tour="mcp-chaves-cabecalho" className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeKeys.length === 0
              ? "Nenhuma chave criada"
              : `${activeKeys.length} chave${activeKeys.length !== 1 ? "s" : ""}`}
          </p>
          <p className="text-xs text-muted-foreground/80">
            Chaves de API para serviços externos consumirem o servidor MCP.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9"
          data-tour="mcp-chaves-nova"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      {/* Lista de chaves ativas */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          {activeKeys.map((k) => (
            <ChaveRow
              key={k.id}
              chave={k}
              isPending={isPending}
              onToggleEnabled={(enabled) => {
                startTransition(async () => {
                  const r = await updateMcpApiKey(k.id, { active: enabled });
                  if (r.success) {
                    await refresh();
                    toast.success(enabled ? "Chave habilitada" : "Chave desabilitada");
                  } else {
                    toast.error(r.error ?? "Erro ao atualizar chave");
                  }
                });
              }}
              onEdit={() => setEditTarget(k)}
              onRotate={() => {
                startTransition(async () => {
                  const r = await rotateMcpApiKey(k.id);
                  if (r.success) {
                    setRevealToken({ token: r.data.token, label: r.data.label });
                    setShowToken(false);
                    await refresh();
                    toast.success("Chave rotacionada, copie o novo token");
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

      {/* Modal de criar chave */}
      <ChaveDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(token, label) => {
          setRevealToken({ token, label });
          setShowToken(false);
          setCreateOpen(false);
          startTransition(async () => {
            await refresh();
          });
        }}
      />

      {/* Modal de editar chave */}
      <ChaveDialog
        mode="edit"
        chave={editTarget ?? undefined}
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
// ChaveRow
// ──────────────────────────────────────────────────────────────────────────────

interface ChaveRowProps {
  chave: McpApiKeyListItem;
  isPending?: boolean;
  revoked?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  onEdit?: () => void;
  onRotate?: () => void;
  onRevoke?: () => void;
  onMarkLost?: () => void;
}

function ChaveRow({
  chave,
  isPending,
  revoked,
  onToggleEnabled,
  onEdit,
  onRotate,
  onRevoke,
  onMarkLost,
}: ChaveRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = !revoked && !chave.active;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:border-foreground/20",
        (revoked || disabled) && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Key className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
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
              {revoked ? (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Revogada
                </Badge>
              ) : disabled ? (
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                  Desabilitada
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground font-mono">••••••••{chave.last4}</p>
            <p className="text-[11px] text-muted-foreground">
              {capabilitiesSummary(chave.capabilities)}
            </p>
            {chave.lastUsedAt && (
              <p className="text-[11px] text-muted-foreground">
                Usada em {formatDatetime(chave.lastUsedAt)}
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
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Switch
                    checked={chave.active}
                    onCheckedChange={(v) => onToggleEnabled?.(v)}
                    disabled={isPending}
                    aria-label={chave.active ? "Desabilitar chave" : "Habilitar chave"}
                  />
                }
              />
              <TooltipContent>{chave.active ? "Desabilitar" : "Habilitar"}</TooltipContent>
            </Tooltip>

            <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Ações da chave"
                    disabled={isPending}
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="end" sideOffset={4}>
                  <Popover.Popup className="z-50 min-w-[200px] rounded-xl border border-border bg-popover p-1 shadow-md text-sm text-popover-foreground outline-none">
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
                      Rotacionar token
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      onClick={() => {
                        setMenuOpen(false);
                        onMarkLost?.();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      Marcar como perdida
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
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CapabilitiesEditor, nível de acesso por módulo
// ──────────────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = [
  { value: "none", label: "Sem acesso", description: "A chave não acessa este módulo" },
  { value: "read", label: "Somente leitura", description: "Consultar dados, sem alterar" },
  { value: "write", label: "Leitura e escrita", description: "Consultar e alterar dados" },
];

function CapabilitiesEditor({
  value,
  onChange,
}: {
  value: ModuleAccessMap;
  onChange: (v: ModuleAccessMap) => void;
}) {
  function setLevel(mod: McpModule, level: AccessLevel) {
    onChange({
      ...value,
      [mod]: {
        level,
        actions: level === "write" ? value[mod].actions : [],
      },
    });
  }

  function toggleAction(mod: McpModule, action: WriteAction) {
    const current = value[mod].actions;
    const next = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action];
    onChange({ ...value, [mod]: { ...value[mod], actions: next } });
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        Defina o que esta chave pode fazer em cada módulo de negócio. Ao escolher Leitura e
        escrita, marque quais ações ela pode executar. Excluir e Mover são sensíveis e ficam
        destacadas.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {MCP_MODULES.map((mod) => {
          const access = value[mod];
          const isWrite = access.level === "write";
          return (
            <div
              key={mod}
              className={cn(
                "rounded-xl border p-3 space-y-2.5 transition-colors",
                isWrite
                  ? "border-violet-500/40 bg-violet-500/[0.04]"
                  : "border-border bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{MODULE_LABELS[mod]}</span>
                {access.level !== "none" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {isWrite ? "Leitura e escrita" : "Leitura"}
                  </Badge>
                )}
              </div>
              <CustomSelect
                aria-label={`Nível de acesso, ${MODULE_LABELS[mod]}`}
                value={access.level}
                onChange={(v) => setLevel(mod, v as AccessLevel)}
                options={LEVEL_OPTIONS}
              />
              {isWrite && (
                <div className="space-y-1.5 pt-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Ações de escrita permitidas
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WRITE_ACTIONS.map((action) => {
                      const sensitive = SENSITIVE_ACTIONS.includes(action);
                      const checked = access.actions.includes(action);
                      return (
                        <label
                          key={action}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                            checked
                              ? sensitive
                                ? "border-amber-500/50 bg-amber-500/10"
                                : "border-violet-500/50 bg-violet-500/10"
                              : "border-border bg-background hover:border-foreground/25",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleAction(mod, action)}
                            aria-label={`${WRITE_ACTION_LABELS[action]} em ${MODULE_LABELS[mod]}`}
                          />
                          <span
                            className={cn(
                              "truncate",
                              sensitive &&
                                checked &&
                                "text-amber-600 dark:text-amber-400 font-medium",
                            )}
                          >
                            {WRITE_ACTION_LABELS[action]}
                          </span>
                          {sensitive && (
                            <AlertTriangle className="ml-auto h-3 w-3 shrink-0 text-amber-500" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ChaveDialog, modal de criar e editar
// ──────────────────────────────────────────────────────────────────────────────

type ChaveDialogProps =
  | {
      mode: "create";
      chave?: undefined;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated: (token: string, label: string) => void;
      onSaved?: undefined;
    }
  | {
      mode: "edit";
      chave: McpApiKeyListItem | undefined;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated?: undefined;
      onSaved: () => void;
    };

function ChaveDialog(props: ChaveDialogProps) {
  const { mode, chave, open, onOpenChange } = props;
  const labelId = useId();
  const descId = useId();
  const tenantId = useId();
  const rateId = useId();
  const originsId = useId();
  const [isPending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tenant, setTenant] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [originDraft, setOriginDraft] = useState("");
  const [access, setAccess] = useState<ModuleAccessMap>(emptyAccessMap());
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hidrata o form ao abrir em modo edição (uma vez por chave alvo).
  const editKey = mode === "edit" ? (chave?.id ?? null) : "create";
  if (open && hydratedFor !== editKey) {
    if (mode === "edit" && chave) {
      setLabel(chave.label);
      setDescription(chave.description ?? "");
      setTenant(chave.tenantId ?? "");
      setRateLimit(chave.rateLimit);
      setExpiresAt(chave.expiresAt ? new Date(chave.expiresAt) : undefined);
      setAllowedOrigins([...chave.allowedOrigins]);
      setAccess(capabilitiesToLevels(chave.capabilities));
    } else if (mode === "create") {
      setLabel("");
      setDescription("");
      setTenant("");
      setRateLimit(60);
      setExpiresAt(undefined);
      setAllowedOrigins([]);
      setAccess(emptyAccessMap());
    }
    setOriginDraft("");
    setHydratedFor(editKey);
  }
  if (!open && hydratedFor !== null) {
    setHydratedFor(null);
  }

  function addOrigin() {
    const raw = originDraft.trim();
    if (!raw) return;
    let normalized: string;
    try {
      normalized = new URL(raw).origin;
    } catch {
      toast.error("Informe uma URL válida, ex.: https://app.exemplo.com");
      return;
    }
    if (allowedOrigins.includes(normalized)) {
      toast.info("Essa origem já está na lista");
      setOriginDraft("");
      return;
    }
    setAllowedOrigins([...allowedOrigins, normalized]);
    setOriginDraft("");
  }

  function removeOrigin(origin: string) {
    setAllowedOrigins(allowedOrigins.filter((o) => o !== origin));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const capabilities: McpCapabilities = levelsToCapabilities(access);
    const origins = allowedOrigins;

    startTransition(async () => {
      if (mode === "create") {
        const r = await createMcpApiKey({
          label: label.trim(),
          description: description.trim() || undefined,
          tenantId: tenant.trim() || null,
          capabilities,
          rateLimit,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          allowedOrigins: origins,
        });
        if (r.success) {
          props.onCreated(r.data.token, r.data.label);
          toast.success("Chave criada, copie o token agora");
        } else {
          toast.error(r.error ?? "Erro ao criar chave");
        }
      } else if (chave) {
        const r = await updateMcpApiKey(chave.id, {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nova chave de acesso" : `Editar chave: ${chave?.label ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Defina o rótulo, os acessos por módulo e o limite de uso. O token aparece uma única vez."
              : "Altere os acessos, o limite e as origens. O token não muda, use Rotacionar para gerar um novo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-1">
          {/* Identificação */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Identificação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={labelId}>
                  Rótulo
                  <RequiredMark />
                </Label>
                <Input
                  id={labelId}
                  placeholder="Ex: integração externa, painel parceiro"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={descId}>Descrição</Label>
                <Input
                  id={descId}
                  placeholder="Onde esta chave será usada (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mode === "create" && (
                <div className="space-y-1.5">
                  <Label htmlFor={tenantId}>Tenant</Label>
                  <Input
                    id={tenantId}
                    placeholder="ID do tenant, vazio para acesso global"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={rateId}>Limite de requisições por minuto</Label>
                <Input
                  id={rateId}
                  type="number"
                  min={1}
                  max={600}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  De 1 a 600 chamadas por minuto, padrão 60.
                </p>
              </div>
              {mode === "create" && (
                <div className="space-y-1.5">
                  <Label>Expiração</Label>
                  <DateField
                    value={expiresAt}
                    onChange={setExpiresAt}
                    placeholder="Sem expiração"
                    fromDate={new Date()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para uma chave permanente.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Acessos por módulo */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Acessos por módulo
            </h3>
            <CapabilitiesEditor value={access} onChange={setAccess} />
          </section>

          {/* Origens permitidas */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Origens permitidas
            </h3>
            <p className="text-xs text-muted-foreground">
              As requisições só são aceitas a partir destas URLs. Sem nenhuma origem, a chave
              aceita requisições de qualquer lugar.
            </p>
            <div className="flex gap-2">
              <Input
                id={originsId}
                placeholder="https://app.exemplo.com"
                value={originDraft}
                onChange={(e) => setOriginDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOrigin();
                  }
                }}
              />
              <Button type="button" variant="outline" className="shrink-0" onClick={addOrigin}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {allowedOrigins.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {allowedOrigins.map((origin) => (
                  <span
                    key={origin}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs font-mono"
                  >
                    {origin}
                    <button
                      type="button"
                      onClick={() => removeOrigin(origin)}
                      aria-label={`Remover origem ${origin}`}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/70">
                Nenhuma origem adicionada. A chave aceita qualquer origem.
              </p>
            )}
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !label.trim()} className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "create" ? "Criar chave" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
