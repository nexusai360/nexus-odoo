"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  listExternalMcpServers,
  createExternalMcpServer,
  toggleExternalMcpServer,
  deleteExternalMcpServer,
  testExternalMcpServer,
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

/**
 * "Plugar MCPs" — registro de servidores MCP externos que o Agente Nex consome
 * como cliente, para agregar capacidades de terceiros (Slack, GitHub, etc.).
 */
export function PlugarMcpsContent({ initial }: Props) {
  const [servers, setServers] = useState<ExternalMcpServerListItem[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  async function refresh() {
    const r = await listExternalMcpServers();
    if (r.success) setServers(r.data);
  }

  function resetForm() {
    setName("");
    setDescription("");
    setTransport("http");
    setUrl("");
    setAuthHeader("");
    setAuthToken("");
    setShowToken(false);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await createExternalMcpServer({
        name: name.trim(),
        description: description.trim() || null,
        transport,
        url: url.trim(),
        authHeader: authHeader.trim() || null,
        authToken: authToken.trim() || null,
      });
      if (r.success) {
        resetForm();
        setShowForm(false);
        await refresh();
        toast.success("Servidor MCP conectado");
      } else {
        toast.error(r.error ?? "Erro ao conectar servidor");
      }
    });
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

  function handleTest(id: string) {
    startTransition(async () => {
      const r = await testExternalMcpServer(id);
      if (r.success) {
        if (r.data.status === "ok") toast.success(r.data.message);
        else toast.error(r.data.message);
        await refresh();
      } else {
        toast.error(r.error ?? "Erro ao testar conexão");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Introdução */}
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Conecte servidores MCP externos para o Agente Nex usar como ferramentas — Slack,
          GitHub, ou qualquer serviço que exponha um endpoint MCP. Cada servidor amplia o que o
          agente consegue fazer.
        </p>
        <p className="text-xs text-muted-foreground">
          Para expor <span className="font-medium text-foreground">o nosso</span> MCP a serviços
          de fora, o caminho é{" "}
          <span className="font-medium text-foreground">
            Integrações → Servidor MCP → Chaves de Acesso
          </span>
          .
        </p>
      </div>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {servers.length === 0
            ? "Nenhum servidor conectado"
            : `${servers.length} servidor${servers.length !== 1 ? "es" : ""} conectado${servers.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Conectar MCP
        </Button>
      </div>

      {/* Form inline */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <p className="text-sm font-semibold">Conectar servidor MCP externo</p>

          <div className="space-y-2">
            <Label htmlFor="mcp-name">Nome *</Label>
            <Input
              id="mcp-name"
              placeholder="Ex: Slack, GitHub, Notion..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-desc">Descrição</Label>
            <Input
              id="mcp-desc"
              placeholder="O que este MCP agrega ao agente (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-transport">Transporte</Label>
            <CustomSelect
              aria-label="Transporte do MCP"
              value={transport}
              onChange={(v) => setTransport(v as "http" | "sse")}
              triggerClassName="min-h-[44px]"
              options={[
                { value: "http", label: "Streamable HTTP", description: "Protocolo MCP padrão" },
                { value: "sse", label: "SSE", description: "Server-Sent Events (legado)" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-url">URL do endpoint *</Label>
            <Input
              id="mcp-url"
              placeholder="https://mcp.exemplo.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-auth-header">Header de autenticação</Label>
            <Input
              id="mcp-auth-header"
              placeholder="Authorization"
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Nome do header que o MCP externo exige. Deixe vazio se for público.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-token">Token</Label>
            <div className="flex items-center gap-2">
              <Input
                id="mcp-token"
                type={showToken ? "text" : "password"}
                placeholder="Token/secret do serviço externo (opcional)"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
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
            </div>
            <p className="text-xs text-muted-foreground">
              Armazenado cifrado. Este é o token do serviço externo — não do Nexus Odoo.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !name.trim() || !url.trim()}
              className="gap-1.5"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Conectar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Lista */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum servidor MCP conectado</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Conecte um MCP externo para ampliar as ferramentas do Agente Nex.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <McpServerRow
              key={server.id}
              server={server}
              isPending={isPending}
              onToggle={handleToggle}
              onTest={handleTest}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// McpServerRow
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ok: { label: "Alcançável", className: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  error: { label: "Inacessível", className: "text-destructive", Icon: AlertCircle },
  unknown: { label: "Não testado", className: "text-muted-foreground", Icon: AlertCircle },
} as const;

function McpServerRow({
  server,
  isPending,
  onToggle,
  onTest,
  onDelete,
}: {
  server: ExternalMcpServerListItem;
  isPending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const status = STATUS_CONFIG[server.lastStatus];
  const StatusIcon = status.Icon;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 space-y-3 transition-colors hover:border-foreground/20",
        !server.enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
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
            {server.description && (
              <p className="text-xs text-muted-foreground">{server.description}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {server.transport === "sse" ? "SSE" : "Streamable HTTP"}
              {server.hasAuth ? " · autenticado" : " · público"} · conectado em{" "}
              {formatDate(server.createdAt)}
            </p>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Switch
                checked={server.enabled}
                onCheckedChange={(v) => onToggle(server.id, v)}
                disabled={isPending}
                aria-label={server.enabled ? "Desabilitar servidor" : "Habilitar servidor"}
              />
            }
          />
          <TooltipContent>{server.enabled ? "Desabilitar" : "Habilitar"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={isPending}
          onClick={() => onTest(server.id)}
        >
          <Wifi className="h-3.5 w-3.5" />
          Testar conexão
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isPending}
          onClick={() => onDelete(server.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover
        </Button>
      </div>
    </div>
  );
}
