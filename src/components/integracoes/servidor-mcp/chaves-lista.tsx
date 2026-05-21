"use client";

import { useState, useTransition, useId } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  MoreHorizontal,
  Pencil,
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
import { DateField } from "@/components/ui/date-field";
import { StepIndicator } from "@/components/ui/step-indicator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover } from "@base-ui/react/popover";
import { useTour } from "@/components/tour/tour-provider";
import { servidorMcpChavesTour } from "@/lib/tours/servidor-mcp-tour";
import { cn } from "@/lib/utils";
import { moduleLabel } from "@/lib/mcp-module-labels";
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
  type ModuleWriteActionsMap,
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
  if (readCount === 0) return "Sem acessos definidos";
  const parts = [`${readCount} ${readCount === 1 ? "módulo" : "módulos"} de leitura`];
  if (writeModules > 0) {
    parts.push(`${writeModules} com escrita`);
  }
  return parts.join(", ");
}

/** Asterisco vermelho para campo obrigatório, padrão do sistema. */
function RequiredMark() {
  return <span className="text-red-500"> *</span>;
}

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
  /** Ações de escrita disponíveis por módulo, derivadas do catálogo. */
  moduleWriteActions: ModuleWriteActionsMap;
}

export function ChavesLista({ initial, moduleWriteActions }: Props) {
  const [keys, setKeys] = useState<McpApiKeyListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  // O tour de Chaves abre o assistente ao chegar no passo do wizard (índice 2).
  const { active, currentStepIndex } = useTour();
  const tourWizardOpen =
    active?.id === servidorMcpChavesTour.id && currentStepIndex >= 2;

  const [createOpenManual, setCreateOpenManual] = useState(false);
  const createOpen = createOpenManual || tourWizardOpen;
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
          onClick={() => setCreateOpenManual(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      {/* Lista de chaves ativas */}
      {activeKeys.length > 0 && (
        <div data-tour="mcp-chaves-lista" className="space-y-2.5">
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

      {/* Wizard de criar chave */}
      <ChaveDialog
        mode="create"
        moduleWriteActions={moduleWriteActions}
        open={createOpen}
        onOpenChange={setCreateOpenManual}
        onCreated={(token, label) => {
          setRevealToken({ token, label });
          setShowToken(false);
          setCreateOpenManual(false);
          startTransition(async () => {
            await refresh();
          });
        }}
      />

      {/* Wizard de editar chave */}
      <ChaveDialog
        mode="edit"
        moduleWriteActions={moduleWriteActions}
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
// ChaveRow, card compacto
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
        "rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20",
        (revoked || disabled) && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Key className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{chave.label}</span>
              <span className="text-xs text-muted-foreground font-mono">••••{chave.last4}</span>
              {chave.isSystemKey && (
                <Badge variant="outline" className="text-[10px]">
                  Sistema
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
            <p className="text-[11.5px] text-muted-foreground">
              {capabilitiesSummary(chave.capabilities)}
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              {revoked
                ? `Revogada em ${formatDate(chave.revokedAt!)}`
                : `Criada em ${formatDate(chave.createdAt)}`}
              {chave.lastUsedAt && !revoked && (
                <> · Usada em {formatDatetime(chave.lastUsedAt)}</>
              )}
              {chave.expiresAt && !revoked && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  · Expira em {formatDate(chave.expiresAt)}
                </span>
              )}
            </p>
          </div>
        </div>

        {!revoked && (
          <div className="flex items-center gap-1 shrink-0">
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

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Editar chave"
                    disabled={isPending}
                    onClick={() => onEdit?.()}
                  />
                }
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Editar</TooltipContent>
            </Tooltip>

            <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Mais ações da chave"
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
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Revogar chave"
                    disabled={isPending}
                    onClick={() => onRevoke?.()}
                  />
                }
              >
                <ShieldOff className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Revogar</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ModuleAccessPicker, seletor de acessos por módulo, estilo roteador de eventos
// ──────────────────────────────────────────────────────────────────────────────

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "Sem acesso" },
  { value: "read", label: "Leitura" },
  { value: "write", label: "Leitura e escrita" },
];

/** Controle segmentado de nível de acesso, na própria linha do módulo. */
function LevelSegmented({
  value,
  onChange,
  ariaLabel,
}: {
  value: AccessLevel;
  onChange: (v: AccessLevel) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {LEVELS.map((l) => {
        const selected = value === l.value;
        return (
          <button
            key={l.value}
            type="button"
            onClick={() => onChange(l.value)}
            aria-pressed={selected}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              selected
                ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

function ModuleAccessPicker({
  value,
  onChange,
  moduleWriteActions,
}: {
  value: ModuleAccessMap;
  onChange: (v: ModuleAccessMap) => void;
  moduleWriteActions: ModuleWriteActionsMap;
}) {
  const withAccess = MCP_MODULES.filter((m) => value[m].level !== "none").length;

  function setLevel(mod: McpModule, level: AccessLevel) {
    onChange({
      ...value,
      [mod]: { level, actions: level === "write" ? value[mod].actions : [] },
    });
  }

  function toggleAction(mod: McpModule, action: WriteAction) {
    const current = value[mod].actions;
    const next = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action];
    onChange({ ...value, [mod]: { ...value[mod], actions: next } });
  }

  function grantReadAll() {
    const next = { ...value };
    for (const m of MCP_MODULES) {
      if (next[m].level === "none") next[m] = { level: "read", actions: [] };
    }
    onChange(next);
  }

  function clearAll() {
    onChange(emptyAccessMap());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {withAccess} de {MCP_MODULES.length} módulos com acesso
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={grantReadAll}
          >
            Conceder leitura a todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearAll}
          >
            Limpar tudo
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {MCP_MODULES.map((mod) => {
          const access = value[mod];
          const hasAccess = access.level !== "none";
          const isWrite = access.level === "write";
          const writeActions = moduleWriteActions[mod] ?? [];
          return (
            <div
              key={mod}
              className={cn(
                "rounded-xl border bg-card transition-colors",
                hasAccess ? "border-violet-500/30" : "border-border",
              )}
            >
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
                    hasAccess
                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {moduleLabel(mod).slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {moduleLabel(mod)}
                </span>
                <LevelSegmented
                  value={access.level}
                  onChange={(v) => setLevel(mod, v)}
                  ariaLabel={`Nível de acesso, ${moduleLabel(mod)}`}
                />
              </div>

              {isWrite && (
                <div className="border-t border-border/60 px-3.5 py-2.5">
                  {writeActions.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      Nenhuma ação de escrita disponível neste módulo ainda. A chave terá só
                      leitura aqui até novas tools de escrita serem publicadas.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[11px] font-medium text-muted-foreground">
                        Ações de escrita:
                      </span>
                      {writeActions.map(({ action }) => {
                        const sensitive = SENSITIVE_ACTIONS.includes(action);
                        const checked = access.actions.includes(action);
                        return (
                          <button
                            key={action}
                            type="button"
                            onClick={() => toggleAction(mod, action)}
                            aria-pressed={checked}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                              checked
                                ? sensitive
                                  ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "border-violet-500/50 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {checked ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            {WRITE_ACTION_LABELS[action]}
                            {sensitive && (
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
// ChaveDialog, wizard de criar e editar
// ──────────────────────────────────────────────────────────────────────────────

type ChaveDialogProps =
  | {
      mode: "create";
      chave?: undefined;
      moduleWriteActions: ModuleWriteActionsMap;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated: (token: string, label: string) => void;
      onSaved?: undefined;
    }
  | {
      mode: "edit";
      chave: McpApiKeyListItem | undefined;
      moduleWriteActions: ModuleWriteActionsMap;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated?: undefined;
      onSaved: () => void;
    };

const WIZARD_STEPS = ["Identificação", "Acessos", "Limites", "Origens", "Resumo"];

function ChaveDialog(props: ChaveDialogProps) {
  const { mode, chave, moduleWriteActions, open, onOpenChange } = props;
  const labelId = useId();
  const descId = useId();
  const tenantId = useId();
  const rateId = useId();
  const originsId = useId();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(1);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tenant, setTenant] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [originDraft, setOriginDraft] = useState("");
  const [access, setAccess] = useState<ModuleAccessMap>(emptyAccessMap());
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hidrata o form ao abrir (uma vez por alvo).
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
    setStep(1);
    setHydratedFor(editKey);
  }
  if (!open && hydratedFor !== null) {
    setHydratedFor(null);
  }

  const modulesWithAccess = MCP_MODULES.filter((m) => access[m].level !== "none").length;

  function addOrigin() {
    const raw = originDraft.trim();
    if (!raw) return;
    // Auto-prefixo: aceita domínio cru, completa com https://.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let normalized: string;
    try {
      normalized = new URL(withScheme).origin;
    } catch {
      toast.error("Informe uma URL válida, ex.: app.exemplo.com");
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

  function submit() {
    const capabilities: McpCapabilities = levelsToCapabilities(access);

    startTransition(async () => {
      if (mode === "create") {
        const r = await createMcpApiKey({
          label: label.trim(),
          description: description.trim() || undefined,
          tenantId: tenant.trim() || null,
          capabilities,
          rateLimit,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          allowedOrigins,
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
          allowedOrigins,
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

  const canAdvance = step !== 1 || label.trim().length > 0;
  const isLast = step === WIZARD_STEPS.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nova chave de acesso" : `Editar chave: ${chave?.label ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Cinco passos: identifique a chave, defina os acessos, ajuste os limites, as origens e revise. O token aparece uma única vez."
              : "Altere os acessos, o limite e as origens. O token não muda, use Rotacionar para gerar um novo."}
          </DialogDescription>
        </DialogHeader>

        <div data-tour="mcp-chaves-wizard" className="flex min-h-0 flex-1 flex-col gap-5 mt-1">
          <StepIndicator steps={WIZARD_STEPS} current={step} className="shrink-0" />

          {/* Corpo do passo: rola dentro, o modal não cresce. */}
          <div className="min-h-[280px] flex-1 overflow-y-auto pr-1">
            {/* Passo 1, Identificação */}
            {step === 1 && (
              <div className="space-y-4">
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
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Um nome para você reconhecer a chave na lista.
                  </p>
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
                {mode === "create" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={tenantId}>Tenant</Label>
                    <Input
                      id={tenantId}
                      placeholder="Ex.: cliente-001, matrix-sp (vazio para acesso global)"
                      value={tenant}
                      onChange={(e) => setTenant(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Identificador da organização/cliente, usado para isolar dados quando a
                      plataforma atende vários clientes (ex.: cliente-001). No uso atual da
                      Matrix, deixe vazio para acesso global.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Passo 2, Acessos por módulo */}
            {step === 2 && (
              <ModuleAccessPicker
                value={access}
                onChange={setAccess}
                moduleWriteActions={moduleWriteActions}
              />
            )}

            {/* Passo 3, Limites e validade */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={rateId}>Limite de requisições por minuto</Label>
                  <Input
                    id={rateId}
                    type="number"
                    min={1}
                    max={600}
                    value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value) || 1)}
                    className="max-w-[180px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantas chamadas por minuto a chave pode fazer. De 1 a 600, padrão 60.
                  </p>
                </div>
                {mode === "create" ? (
                  <div className="space-y-1.5">
                    <Label>Expiração</Label>
                    <DateField
                      value={expiresAt}
                      onChange={setExpiresAt}
                      placeholder="Sem expiração"
                      fromDate={new Date()}
                      className="max-w-[280px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para uma chave permanente. Use os menus de mês e ano do
                      calendário para datas distantes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Expiração</Label>
                    <p className="text-sm text-muted-foreground">
                      {chave?.expiresAt
                        ? `Expira em ${formatDate(chave.expiresAt)} (definido na criação).`
                        : "Chave permanente, sem expiração (definido na criação)."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Passo 4, Origens permitidas */}
            {step === 4 && (
              <div className="space-y-2">
                <Label htmlFor={originsId}>Origens permitidas</Label>
                <p className="text-xs text-muted-foreground">
                  As requisições só são aceitas a partir destas URLs. Sem nenhuma origem, a
                  chave aceita requisições de qualquer lugar. O `https://` é completado
                  automaticamente.
                </p>
                <div className="flex gap-2">
                  <Input
                    id={originsId}
                    placeholder="app.exemplo.com"
                    value={originDraft}
                    onChange={(e) => setOriginDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOrigin();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={addOrigin}
                  >
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
              </div>
            )}

            {/* Passo 5, Resumo */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumo da chave
                  </p>
                  <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                    <dt className="text-muted-foreground">Rótulo</dt>
                    <dd className="text-foreground">{label.trim() || "Sem rótulo"}</dd>
                    <dt className="text-muted-foreground">Limite por minuto</dt>
                    <dd className="text-foreground">{rateLimit}</dd>
                    <dt className="text-muted-foreground">Expiração</dt>
                    <dd className="text-foreground">
                      {mode === "create"
                        ? expiresAt
                          ? formatDate(expiresAt)
                          : "Permanente"
                        : chave?.expiresAt
                          ? formatDate(chave.expiresAt)
                          : "Permanente"}
                    </dd>
                    <dt className="text-muted-foreground">Origens</dt>
                    <dd className="text-foreground">
                      {allowedOrigins.length > 0
                        ? `${allowedOrigins.length} permitida${allowedOrigins.length !== 1 ? "s" : ""}`
                        : "Qualquer origem"}
                    </dd>
                  </dl>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Acessos por módulo ({modulesWithAccess})
                  </p>
                  {modulesWithAccess === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      Nenhum módulo com acesso. A chave não poderá consultar nem alterar dados.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {MCP_MODULES.filter((m) => access[m].level !== "none").map((m) => {
                        const a = access[m];
                        return (
                          <div
                            key={m}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                          >
                            <span className="text-sm font-medium">{moduleLabel(m)}</span>
                            <span className="text-right">
                              <span className="block text-[12px] font-medium text-violet-600 dark:text-violet-400">
                                {a.level === "write" ? "Leitura e escrita" : "Leitura"}
                              </span>
                              {a.level === "write" && a.actions.length > 0 && (
                                <span className="block text-[11.5px] text-muted-foreground">
                                  {a.actions.map((x) => WRITE_ACTION_LABELS[x]).join(", ")}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navegação */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={isPending}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Button>
              )}
              {!isLast ? (
                <Button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canAdvance}
                  className="gap-1.5"
                >
                  Próximo
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={isPending || !label.trim()}
                  className="gap-1.5"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {mode === "create" ? "Criar chave" : "Salvar alterações"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
