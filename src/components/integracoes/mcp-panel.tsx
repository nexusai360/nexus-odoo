"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  mcpUrl: string;
  maskedToken: string;
  healthStatus: "ok" | "error" | "unknown";
}

/**
 * Painel de informações do MCP — exibe endpoint, token mascarado (read-only)
 * e documentação para conexão com o node Agent do n8n.
 *
 * O MCP_SERVICE_TOKEN é uma variável de ambiente — a UI não o rotaciona.
 * Rotação deve ser feita via Portainer/env conforme instrução exibida abaixo.
 */
export function McpPanel({ mcpUrl, maskedToken, healthStatus }: Props) {
  const [showToken, setShowToken] = useState(false);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado`);
    });
  }

  const displayToken = showToken ? maskedToken : maskedToken.replace(/[^•]/g, "•").slice(0, 20) + "••••";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status de saúde */}
      <div className="flex items-center gap-2">
        {healthStatus === "ok" ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              MCP online
            </span>
          </>
        ) : healthStatus === "error" ? (
          <>
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              MCP inacessível — verifique o container mcp
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Status desconhecido
            </span>
          </>
        )}
      </div>

      {/* Endpoint */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Endpoint do MCP</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all">
            {mcpUrl || "MCP_URL não configurada no ambiente"}
          </code>
          {mcpUrl && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Copiar endpoint"
              className="shrink-0"
              onClick={() => copyToClipboard(mcpUrl, "Endpoint")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Token de serviço — read-only, mascarado */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Token de serviço (MCP_SERVICE_TOKEN)</p>
        <div className="flex items-center gap-2">
          <code
            className={cn(
              "flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono tracking-widest",
              !showToken && "select-none",
            )}
          >
            {displayToken || "Não configurado"}
          </code>
          <Button
            variant="outline"
            size="sm"
            aria-label={showToken ? "Ocultar token" : "Revelar token mascarado"}
            className="shrink-0"
            onClick={() => setShowToken((v) => !v)}
          >
            {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Como rotacionar o token
          </p>
          <ol className="list-decimal list-inside space-y-0.5 text-xs">
            <li>Gere um novo secret: <code className="bg-muted rounded px-1">openssl rand -hex 32</code></li>
            <li>No Portainer, atualize a env var <code className="bg-muted rounded px-1">MCP_SERVICE_TOKEN</code> do container <strong>mcp</strong></li>
            <li>Atualize também <code className="bg-muted rounded px-1">MCP_SERVICE_TOKEN</code> no container <strong>app</strong> (worker usa a mesma chave)</li>
            <li>Redeploy ambos os containers. O token antigo para de funcionar imediatamente.</li>
          </ol>
        </div>
      </div>

      {/* Documentação de conexão — node Agent do n8n */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Conectar o node Agent do n8n</p>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">
          O MCP do Nexus Odoo usa o protocolo Streamable HTTP do{" "}
          <code>@modelcontextprotocol/sdk</code>. Configure assim no n8n:
        </p>
        <div className="space-y-2 text-xs">
          <div className="rounded-lg bg-muted p-3 font-mono space-y-1">
            <p><span className="text-muted-foreground">Protocolo:</span> Streamable HTTP</p>
            <p><span className="text-muted-foreground">URL:</span> {mcpUrl || "<MCP_URL>"}/mcp</p>
            <p><span className="text-muted-foreground">Auth:</span> Bearer token</p>
            <p><span className="text-muted-foreground">Header:</span> Authorization: Bearer {"<MCP_SERVICE_TOKEN>"}</p>
          </div>
          <p className="text-muted-foreground">
            O header <code>x-user-id</code> deve conter o ID do usuário da plataforma (obrigatório
            para o RBAC de 7 camadas). O n8n injeta isso via expressão:{" "}
            <code>{`{{ $json.userId }}`}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
