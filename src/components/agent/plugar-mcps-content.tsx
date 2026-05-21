"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MinusCircle,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Switch } from "@/components/ui/switch";
import { StepIndicator } from "@/components/ui/step-indicator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTour } from "@/components/tour/tour-provider";
import { plugarMcpsTour } from "@/lib/tours/plugar-mcps-tour";
import { cn } from "@/lib/utils";
import {
  listExternalMcpServers,
  createExternalMcpServer,
  updateExternalMcpServer,
  toggleExternalMcpServer,
  deleteExternalMcpServer,
  testExternalMcpEndpoint,
} from "@/lib/actions/external-mcp-servers";
import type { ExternalMcpServerListItem } from "@/lib/actions/external-mcp-servers-types";

interface Props {
  initial: ExternalMcpServerListItem[];
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/** Estado de conexão do servidor, derivado de enabled + lastStatus. */
function serverStatus(server: ExternalMcpServerListItem) {
  if (!server.enabled) {
    return { label: "Desativado", className: "text-muted-foreground", Icon: MinusCircle };
  }
  if (server.lastStatus === "ok") {
    return {
      label: "Conectado",
      className: "text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle2,
    };
  }
  if (server.lastStatus === "error") {
    return { label: "Sem conexão", className: "text-destructive", Icon: AlertCircle };
  }
  return { label: "Não testado", className: "text-muted-foreground", Icon: AlertCircle };
}

/**
 * "Plugar MCPs": registro de servidores MCP externos que o Agente Nex consome
 * como cliente.
 */
export function PlugarMcpsContent({ initial }: Props) {
  const [servers, setServers] = useState<ExternalMcpServerListItem[]>(initial);
  const [isPending, startTransition] = useTransition();

  const { active } = useTour();
  const tourActive = active?.id === plugarMcpsTour.id;

  const [createOpenManual, setCreateOpenManual] = useState(false);
  const createOpen = createOpenManual || tourActive;
  const [editTarget, setEditTarget] = useState<ExternalMcpServerListItem | null>(null);

  async function refresh() {
    const r = await listExternalMcpServers();
    if (r.success) setServers(r.data);
  }

  function handleToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const r = await toggleExternalMcpServer(id, enabled);
      if (r.success) await refresh();
      else toast.error(r.error ?? "Erro ao atualizar servidor");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await deleteExternalMcpServer(id);
      if (r.success) {
        await refresh();
        toast.success("Servidor removido");
      } else {
        toast.error(r.error ?? "Erro ao remover servidor");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Conecte servidores MCP externos para o Agente Nex usar como ferramentas. Para expor o
        nosso MCP a terceiros, use as Chaves de Acesso do Servidor MCP.
      </p>

      <div data-tour="plugar-mcps-novo" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {servers.length === 0
            ? "Nenhum servidor conectado"
            : `${servers.length} servidor${servers.length !== 1 ? "es" : ""} conectado${servers.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() => setCreateOpenManual(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Conectar MCP
        </Button>
      </div>

      <div data-tour="plugar-mcps-lista">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
            <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum servidor MCP conectado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Conecte um MCP externo para ampliar as ferramentas do Agente Nex.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {servers.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                isPending={isPending}
                onToggle={handleToggle}
                onEdit={() => setEditTarget(server)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <McpWizardDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpenManual}
        onDone={() => {
          setCreateOpenManual(false);
          startTransition(async () => {
            await refresh();
          });
        }}
      />
      <McpWizardDialog
        mode="edit"
        server={editTarget ?? undefined}
        open={editTarget != null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        onDone={() => {
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
// McpServerRow, card compacto
// ──────────────────────────────────────────────────────────────────────────────

function McpServerRow({
  server,
  isPending,
  onToggle,
  onEdit,
  onDelete,
}: {
  server: ExternalMcpServerListItem;
  isPending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const status = serverStatus(server);
  const StatusIcon = status.Icon;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20",
        !server.enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Plug className="h-4 w-4 text-violet-500" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{server.name}</span>
              <span className={cn("inline-flex items-center gap-1 text-[11px]", status.className)}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{server.url}</p>
            <p className="text-[11px] text-muted-foreground">
              {server.transport === "sse" ? "SSE" : "Streamable HTTP"}
              {server.hasAuth ? " · autenticado" : " · público"} · conectado em{" "}
              {formatDate(server.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(v) => onToggle(server.id, v)}
                  disabled={isPending}
                  aria-label={server.enabled ? "Desativar servidor" : "Ativar servidor"}
                />
              }
            />
            <TooltipContent>{server.enabled ? "Desativar" : "Ativar"}</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-0.5">
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
                    aria-label="Editar servidor"
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
                    onClick={() => onDelete(server.id)}
                    aria-label="Remover servidor"
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
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// McpWizardDialog, wizard de conectar e editar
// ──────────────────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ["Identificação", "Conexão", "Autenticação", "Revisão"];
const TRANSPORT_OPTIONS = [
  { value: "http", label: "Streamable HTTP", description: "Protocolo MCP padrão" },
  { value: "sse", label: "SSE", description: "Server-Sent Events (legado)" },
];

function McpWizardDialog({
  mode,
  server,
  open,
  onOpenChange,
  onDone,
}: {
  mode: "create" | "edit";
  server?: ExternalMcpServerListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testedOk, setTestedOk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const hydrateKey = mode === "edit" ? (server?.id ?? null) : "create";
  if (open && hydratedFor !== hydrateKey) {
    if (mode === "edit" && server) {
      setName(server.name);
      setDescription(server.description ?? "");
      setTransport(server.transport === "sse" ? "sse" : "http");
      setUrl(server.url);
      setAuthHeader(server.authHeader ?? "");
      setAuthToken("");
      // Edição começa "testada"; mudar URL/header/token exige novo teste.
      setTestedOk(true);
    } else {
      setName("");
      setDescription("");
      setTransport("http");
      setUrl("");
      setAuthHeader("");
      setAuthToken("");
      setTestedOk(false);
    }
    setShowToken(false);
    setTestMessage(null);
    setStep(1);
    setHydratedFor(hydrateKey);
  }
  if (!open && hydratedFor !== null) setHydratedFor(null);

  /** Mudança em campo de conexão invalida o teste anterior. */
  function invalidateTest() {
    setTestedOk(false);
    setTestMessage(null);
  }

  function runTest() {
    setTesting(true);
    setTestMessage(null);
    startTransition(async () => {
      const r = await testExternalMcpEndpoint({
        url: url.trim(),
        authHeader: authHeader.trim() || null,
        authToken: authToken.trim() || null,
        serverId: mode === "edit" ? (server?.id ?? null) : null,
      });
      setTesting(false);
      if (!r.success) {
        setTestMessage({ ok: false, text: r.error });
        return;
      }
      setTestMessage({ ok: r.data.status === "ok", text: r.data.message });
      if (r.data.status === "ok") setTestedOk(true);
    });
  }

  function finish() {
    startTransition(async () => {
      if (mode === "create") {
        const r = await createExternalMcpServer({
          name: name.trim(),
          description: description.trim() || null,
          transport,
          url: url.trim(),
          authHeader: authHeader.trim() || null,
          authToken: authToken.trim() || null,
        });
        if (r.success) {
          onDone();
          toast.success("Servidor MCP conectado");
        } else {
          toast.error(r.error ?? "Erro ao conectar servidor");
        }
      } else if (server) {
        const r = await updateExternalMcpServer(server.id, {
          name: name.trim(),
          description: description.trim() || null,
          transport,
          url: url.trim(),
          authHeader: authHeader.trim() || null,
          // Token vazio mantém o atual; preenchido troca.
          ...(authToken.trim() ? { authToken: authToken.trim() } : {}),
        });
        if (r.success) {
          onDone();
          toast.success("Servidor MCP atualizado");
        } else {
          toast.error(r.error ?? "Erro ao atualizar servidor");
        }
      }
    });
  }

  const canAdvance =
    step === 1
      ? name.trim().length > 0
      : step === 2
        ? url.trim().length > 0
        : true;
  const isLast = step === WIZARD_STEPS.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Conectar servidor MCP" : `Editar: ${server?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            Quatro passos: identifique o servidor, informe a conexão e a autenticação, teste e
            confirme.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 mt-1">
          <StepIndicator steps={WIZARD_STEPS} current={step} className="shrink-0" />

          <div className="min-h-[260px] flex-1 overflow-y-auto pr-1">
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-w-name">
                    Nome <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="mcp-w-name"
                    placeholder="Ex.: Slack, GitHub, Notion"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-w-desc">Descrição</Label>
                  <Input
                    id="mcp-w-desc"
                    placeholder="O que este MCP agrega ao agente (opcional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Transporte</Label>
                  <CustomSelect
                    aria-label="Transporte do MCP"
                    value={transport}
                    onChange={(v) => {
                      setTransport(v as "http" | "sse");
                      invalidateTest();
                    }}
                    options={TRANSPORT_OPTIONS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-w-url">
                    URL do endpoint <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="mcp-w-url"
                    placeholder="https://mcp.exemplo.com/mcp"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      invalidateTest();
                    }}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-w-header">Header de autenticação</Label>
                  <Input
                    id="mcp-w-header"
                    placeholder="Authorization"
                    value={authHeader}
                    onChange={(e) => {
                      setAuthHeader(e.target.value);
                      invalidateTest();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome do header que o MCP externo exige. Deixe vazio se for público.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-w-token">Token</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="mcp-w-token"
                      type={showToken ? "text" : "password"}
                      placeholder={
                        mode === "edit"
                          ? "Deixe vazio para manter o token atual"
                          : "Token/secret do serviço externo (opcional)"
                      }
                      value={authToken}
                      onChange={(e) => {
                        setAuthToken(e.target.value);
                        invalidateTest();
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                      onClick={() => setShowToken((v) => !v)}
                    >
                      {showToken ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Armazenado cifrado. É o token do serviço externo, não do Nexus Odoo.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumo
                  </p>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="text-foreground">{name.trim() || "Sem nome"}</dd>
                    <dt className="text-muted-foreground">Transporte</dt>
                    <dd className="text-foreground">
                      {transport === "sse" ? "SSE" : "Streamable HTTP"}
                    </dd>
                    <dt className="text-muted-foreground">URL</dt>
                    <dd className="break-all font-mono text-[12px] text-foreground">
                      {url.trim() || "Sem URL"}
                    </dd>
                    <dt className="text-muted-foreground">Autenticação</dt>
                    <dd className="text-foreground">
                      {authHeader.trim() ? `Header ${authHeader.trim()}` : "Pública"}
                    </dd>
                  </dl>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Teste a conexão antes de {mode === "create" ? "conectar" : "concluir"}. O
                    botão {mode === "create" ? "Conectar" : "Concluir"} libera após um teste com
                    sucesso.
                  </p>
                  {testMessage && (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                        testMessage.ok
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {testMessage.ok ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{testMessage.text}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={runTest}
                    disabled={isPending || testing || testedOk || !url.trim()}
                    className="gap-1.5"
                  >
                    {testing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wifi className="h-3.5 w-3.5" />
                    )}
                    Testar conexão
                  </Button>
                  <Button
                    type="button"
                    onClick={finish}
                    disabled={isPending || !testedOk}
                    className="gap-1.5"
                  >
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {mode === "create" ? "Conectar" : "Concluir"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
