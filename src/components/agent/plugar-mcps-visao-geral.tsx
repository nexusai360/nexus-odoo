import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExternalMcpServerListItem } from "@/lib/actions/external-mcp-servers-types";
import type { ExternalMcpCallStats } from "@/lib/actions/external-mcp-call-log";

interface Props {
  servers: ExternalMcpServerListItem[];
  stats: ExternalMcpCallStats | null;
}

/**
 * Visão Geral do Plugar MCP: responde, em blocos, quantos servidores externos
 * estão conectados, quanto o Agente Nex os usou nas últimas 24h e quais são os
 * mais usados. A saúde de uso vem do `ExternalMcpCallLog` (chamadas reais), não
 * só do `lastStatus` de alcançabilidade.
 */
export function PlugarMcpsVisaoGeral({ servers, stats }: Props) {
  const total = servers.length;
  const conectados = servers.filter((s) => s.enabled && s.lastStatus === "ok").length;
  const semConexao = servers.filter((s) => s.enabled && s.lastStatus === "error").length;
  const pendentes = servers.filter(
    (s) => !s.enabled || s.lastStatus === "unknown",
  ).length;
  const hasUsage = stats != null && stats.totalCalls > 0;

  if (total === 0) {
    return (
      <div className="max-w-4xl">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum servidor MCP conectado</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Conecte um MCP externo na aba Servidores para ampliar as ferramentas do
            Agente Nex.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="text-[15px] font-semibold">Servidores conectados</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatItem label="Total" value={String(total)} />
          <StatItem label="Conectados" value={String(conectados)} />
          <StatItem
            label="Sem conexão"
            value={String(semConexao)}
            warn={semConexao > 0}
          />
          <StatItem label="Não testados ou desativados" value={String(pendentes)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="text-[15px] font-semibold">Uso nas últimas 24 horas</p>
        {hasUsage ? (
          <div className="grid grid-cols-3 gap-3">
            <StatItem label="Chamadas" value={String(stats!.totalCalls)} />
            <StatItem
              label="Taxa de erro"
              value={`${(stats!.errorRate * 100).toFixed(1)}%`}
              warn={stats!.errorRate > 0.1}
            />
            <StatItem
              label="Latência típica"
              value={stats!.medianDurationMs == null ? "-" : `${stats!.medianDurationMs} ms`}
            />
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nenhuma chamada do Agente Nex a MCPs externos nas últimas 24 horas.
          </p>
        )}
      </div>

      {hasUsage && stats!.topServers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <p className="text-[15px] font-semibold">Servidores mais usados</p>
          <div className="space-y-1.5">
            {stats!.topServers.map((s) => (
              <div
                key={s.serverId ?? s.serverName}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <span className="text-[13px] font-medium truncate">{s.serverName}</span>
                <span className="text-[13px] text-muted-foreground shrink-0">
                  {s.count} chamada{s.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold font-mono tabular-nums",
          warn && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
