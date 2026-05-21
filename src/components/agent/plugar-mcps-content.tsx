"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  mcpUrl: string;
  maskedToken: string;
  healthStatus: "ok" | "error" | "unknown";
}

/**
 * Conteúdo de "Plugar MCPs" — exibe endpoint, token mascarado (read-only)
 * e documentação para conexão com o node Agent do n8n.
 *
 * O MCP_SERVICE_TOKEN é uma variável de ambiente — a UI não o rotaciona.
 * Rotação deve ser feita via Portainer/env conforme instrução exibida abaixo.
 */
export function PlugarMcpsContent({ mcpUrl, maskedToken, healthStatus }: Props) {
  const [showToken, setShowToken] = useState(false);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado`);
    });
  }

  const displayToken = showToken ? maskedToken : maskedToken.replace(/[^•]/g, "•").slice(0, 20) + "••••";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status de saúde */}
      <Card className="rounded-xl border border-border bg-muted/30 p-2">
        <CardContent className="flex items-center gap-3 py-3">
          {healthStatus === "ok" ? (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  MCP online
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Servidor MCP respondendo no /health.
                </p>
              </div>
            </>
          ) : healthStatus === "error" ? (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </span>
              <div>
                <p className="text-sm font-semibold text-destructive">
                  MCP inacessível
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Verifique o container <code>mcp</code> no Portainer.
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Status desconhecido
                </p>
                <p className="text-[11px] text-muted-foreground">
                  MCP_URL não configurada no ambiente.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Endpoint + Token */}
      <Card className="rounded-xl border border-border bg-muted/30 p-2">
        <CardHeader className="pb-3">
          <CardTitle>Endpoint &amp; token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pb-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Endpoint do MCP
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-background/60 border border-border px-3 py-2 text-sm font-mono break-all">
                {mcpUrl || "MCP_URL não configurada no ambiente"}
              </code>
              {mcpUrl && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Copiar endpoint"
                        className="shrink-0 h-9"
                        onClick={() => copyToClipboard(mcpUrl, "Endpoint")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>Copiar para a área de transferência</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Token de serviço (MCP_SERVICE_TOKEN)
            </p>
            <div className="flex items-center gap-2">
              <code
                className={cn(
                  "flex-1 rounded-lg bg-background/60 border border-border px-3 py-2 text-sm font-mono tracking-widest",
                  !showToken && "select-none",
                )}
              >
                {displayToken || "Não configurado"}
              </code>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={
                        showToken ? "Ocultar token" : "Revelar token mascarado"
                      }
                      className="shrink-0 h-9"
                      onClick={() => setShowToken((v) => !v)}
                    >
                      {showToken ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  }
                />
                <TooltipContent>
                  {showToken ? "Ocultar token" : "Revelar token"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-1.5">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Como rotacionar o token
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs text-muted-foreground">
              <li>
                Gere um novo secret:{" "}
                <code className="bg-muted rounded px-1">openssl rand -hex 32</code>
              </li>
              <li>
                No Portainer, atualize a env var{" "}
                <code className="bg-muted rounded px-1">MCP_SERVICE_TOKEN</code>{" "}
                do container <strong>mcp</strong>
              </li>
              <li>
                Atualize também{" "}
                <code className="bg-muted rounded px-1">MCP_SERVICE_TOKEN</code>{" "}
                no container <strong>app</strong> (worker usa a mesma chave)
              </li>
              <li>
                Redeploy ambos os containers. O token antigo para de funcionar
                imediatamente.
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Documentação de conexão — node Agent do n8n */}
      <Card className="rounded-xl border border-border bg-muted/30 p-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            Conectar o node Agent do n8n
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-5">
          <p className="text-xs text-muted-foreground">
            O MCP do Nexus Odoo usa o protocolo Streamable HTTP do{" "}
            <code>@modelcontextprotocol/sdk</code>. Configure assim no n8n:
          </p>
          <div className="rounded-lg bg-background/60 border border-border p-3 font-mono text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">Protocolo:</span> Streamable HTTP
            </p>
            <p>
              <span className="text-muted-foreground">URL:</span>{" "}
              {mcpUrl || "<MCP_URL>"}/mcp
            </p>
            <p>
              <span className="text-muted-foreground">Auth:</span> Bearer token
            </p>
            <p>
              <span className="text-muted-foreground">Header:</span> Authorization:
              Bearer {"<MCP_SERVICE_TOKEN>"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            O header <code>x-user-id</code> deve conter o ID do usuário da
            plataforma (obrigatório para o RBAC de 7 camadas). O n8n injeta isso
            via expressão: <code>{`{{ $json.userId }}`}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
