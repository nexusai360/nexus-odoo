"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  MinusCircle,
  Activity,
  Zap,
  BarChart2,
  Clock,
  GitCommit,
  Layers,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Mcp24hMetrics } from "@/lib/actions/mcp-metrics";

interface Props {
  mcpPublicUrl: string;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  versionInfo: { version: string; commit: string } | null;
  metrics: Mcp24hMetrics | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Status badge config
// ──────────────────────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    textClass: "text-emerald-700 dark:text-emerald-400",
    desc: "Servidor MCP respondendo normalmente.",
  },
  degraded: {
    label: "Degraded",
    icon: MinusCircle,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    textClass: "text-amber-700 dark:text-amber-400",
    desc: "Servidor MCP respondendo com limitações.",
  },
  unhealthy: {
    label: "Unhealthy",
    icon: AlertCircle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/10",
    badgeClass: "border-destructive/30 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
    desc: "Servidor MCP inacessível — verifique o container no Portainer.",
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copiado`);
  });
}

function formatErrorRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${ms} ms`;
}

// ──────────────────────────────────────────────────────────────────────────────
// McpVisaoGeral
// ──────────────────────────────────────────────────────────────────────────────

export function McpVisaoGeral({ mcpPublicUrl, healthStatus, versionInfo, metrics }: Props) {
  const health = HEALTH_CONFIG[healthStatus];
  const HealthIcon = health.icon;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* ── Card 1: Status + URL + badges informativos ─────────────────────── */}
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Servidor MCP</CardTitle>
            <Badge
              variant="outline"
              className={cn("text-[11px] font-medium", health.badgeClass)}
            >
              <span
                className={cn(
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                  healthStatus === "healthy" && "bg-emerald-500",
                  healthStatus === "degraded" && "bg-amber-500",
                  healthStatus === "unhealthy" && "bg-destructive",
                )}
              />
              {health.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pb-5">
          {/* Status row */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                health.bgClass,
              )}
            >
              <HealthIcon className={cn("h-4 w-4", health.iconClass)} />
            </span>
            <p className={cn("text-sm font-medium", health.textClass)}>{health.desc}</p>
          </div>

          {/* URL pública */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              URL pública do MCP
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-background/60 border border-border px-3 py-2 text-sm font-mono break-all">
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
                        aria-label="Copiar URL do MCP"
                        className="shrink-0 h-9"
                        onClick={() => copyToClipboard(mcpPublicUrl, "URL do MCP")}
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

          {/* Badges informativos */}
          <div className="flex flex-wrap gap-2">
            <InfoBadge
              icon={Zap}
              label="Transport"
              value="Streamable HTTP"
            />
            <InfoBadge
              icon={Layers}
              label="Protocolo"
              value="2025-06-18"
            />
            {versionInfo && (
              <>
                <InfoBadge
                  icon={Activity}
                  label="Versão"
                  value={versionInfo.version}
                />
                <InfoBadge
                  icon={GitCommit}
                  label="Commit"
                  value={versionInfo.commit}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: Métricas 24h ────────────────────────────────────────────── */}
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            Métricas — últimas 24h
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {metrics ? (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricKpi label="Total de chamadas" value={String(metrics.totalCalls)} />
                <MetricKpi
                  label="Taxa de erro"
                  value={formatErrorRate(metrics.errorRate)}
                  highlight={metrics.errorRate > 10 ? "warn" : undefined}
                />
                <MetricKpi
                  label="Latência p50"
                  value={formatMs(metrics.p50Ms)}
                  icon={Clock}
                />
                <MetricKpi
                  label="Latência p99"
                  value={formatMs(metrics.p99Ms)}
                  icon={Clock}
                  highlight={metrics.p99Ms != null && metrics.p99Ms > 3000 ? "warn" : undefined}
                />
              </div>

              {/* Top tools */}
              {metrics.topTools.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Top 5 tools
                  </p>
                  <div className="space-y-1.5">
                    {metrics.topTools.map((t) => (
                      <div
                        key={t.tool}
                        className="flex items-center justify-between rounded-lg bg-background/60 border border-border px-3 py-2"
                      >
                        <code className="text-xs font-mono text-foreground">{t.tool}</code>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {t.total} chamada{t.total !== 1 ? "s" : ""}
                          </span>
                          {t.errors > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-destructive/30 bg-destructive/10 text-destructive"
                            >
                              {t.errors} erro{t.errors !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {metrics.totalCalls === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma chamada registrada nas últimas 24 horas.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar métricas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function InfoBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium font-mono">{value}</span>
    </div>
  );
}

function MetricKpi({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  highlight?: "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5 space-y-1">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-semibold font-mono",
          highlight === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
