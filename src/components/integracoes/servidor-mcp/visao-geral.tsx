"use client";

import { AlertCircle, CheckCircle2, Copy, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Mcp24hMetrics } from "@/lib/actions/mcp-metrics";

interface Props {
  mcpPublicUrl: string;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  metrics: Mcp24hMetrics | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Config de estado de saúde, linguagem direta, sem jargão
// ──────────────────────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy: {
    title: "Servidor no ar",
    desc: "O endpoint MCP está respondendo normalmente.",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
  },
  degraded: {
    title: "Servidor degradado",
    desc: "O endpoint MCP responde, mas com limitações.",
    icon: MinusCircle,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
  },
  unhealthy: {
    title: "Servidor indisponível",
    desc: "O endpoint MCP não respondeu. Verifique o serviço.",
    icon: AlertCircle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/10",
  },
} as const;

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copiado`);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// McpVisaoGeral: responde 3 perguntas. Está no ar? Está sendo usado? O que mais é chamado?
// ──────────────────────────────────────────────────────────────────────────────

export function McpVisaoGeral({ mcpPublicUrl, healthStatus, metrics }: Props) {
  const health = HEALTH_CONFIG[healthStatus];
  const HealthIcon = health.icon;
  const hasUsage = metrics != null && metrics.totalCalls > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Está no ar? */}
      <div data-tour="mcp-status" className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              health.bgClass,
            )}
          >
            <HealthIcon className={cn("h-5 w-5", health.iconClass)} />
          </span>
          <div className="space-y-0.5">
            <p className="text-[15px] font-semibold">{health.title}</p>
            <p className="text-[13px] text-muted-foreground">{health.desc}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted-foreground">Endpoint público</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm font-mono break-all">
              {mcpPublicUrl || "Não configurado"}
            </code>
            {mcpPublicUrl && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Copiar endpoint público"
                      className="shrink-0 h-9"
                      onClick={() => copyToClipboard(mcpPublicUrl, "Endpoint")}
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
      </div>

      {/* Está sendo usado? */}
      <div data-tour="mcp-uso" className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="text-[15px] font-semibold">Uso nas últimas 24 horas</p>
        {hasUsage ? (
          <div className="grid grid-cols-3 gap-3">
            <MetricItem label="Chamadas" value={String(metrics!.totalCalls)} />
            <MetricItem
              label="Taxa de erro"
              value={`${metrics!.errorRate.toFixed(1)}%`}
              warn={metrics!.errorRate > 10}
            />
            <MetricItem
              label="Latência típica"
              value={metrics!.p50Ms == null ? "-" : `${metrics!.p50Ms} ms`}
            />
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nenhuma chamada registrada nas últimas 24 horas.
          </p>
        )}
      </div>

      {/* ── O que mais é chamado? ───────────────────────────────────────────── */}
      {hasUsage && metrics!.topTools.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <p className="text-[15px] font-semibold">Tools mais usadas</p>
          <div className="space-y-1.5">
            {metrics!.topTools.map((t) => (
              <div
                key={t.tool}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <code className="text-[13px] font-mono truncate">{t.tool}</code>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[13px] text-muted-foreground">
                    {t.total} chamada{t.total !== 1 ? "s" : ""}
                  </span>
                  {t.errors > 0 && (
                    <span className="text-[10px] rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      {t.errors} erro{t.errors !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MetricItem
// ──────────────────────────────────────────────────────────────────────────────

function MetricItem({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
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
