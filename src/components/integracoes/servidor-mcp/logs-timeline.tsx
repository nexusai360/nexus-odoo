"use client";

import { useState, useTransition, useCallback } from "react";
import {
  ChevronDown,
  Clock,
  Download,
  Filter,
  Loader2,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Key,
  Layers,
  Terminal,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  queryAuditLogs,
  type AuditLogItem,
  type AuditLogFilters,
} from "@/lib/actions/mcp-audit-query";

// ──────────────────────────────────────────────────────────────────────────────
// Status badge config
// ──────────────────────────────────────────────────────────────────────────────

type StatusKey = "success" | "error" | "denied" | "pending" | string;

function getStatusConfig(status: string | null, outcome: string) {
  const s = (status ?? outcome ?? "").toLowerCase();
  if (s === "success" || s === "ok" || outcome === "success")
    return {
      label: "success",
      icon: CheckCircle2,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  if (s === "error" || s === "failed" || outcome === "error")
    return {
      label: "error",
      icon: XCircle,
      className:
        "border-destructive/30 bg-destructive/10 text-destructive",
    };
  if (s === "denied" || s === "forbidden")
    return {
      label: "denied",
      icon: Shield,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  return {
    label: s || "—",
    icon: Info,
    className:
      "border-border bg-muted/40 text-muted-foreground",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

function JsonPreview({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground italic">null</span>;
  return (
    <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-background/60 border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Detail drawer (Dialog)
// ──────────────────────────────────────────────────────────────────────────────

function LogDetailDrawer({
  log,
  open,
  onClose,
}: {
  log: AuditLogItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!log) return null;
  const statusConfig = getStatusConfig(log.status, log.outcome);
  const StatusIcon = statusConfig.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <code className="font-mono">{log.tool}</code>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("text-[11px]", statusConfig.className)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
            {log.httpStatus && (
              <Badge variant="outline" className="text-[11px]">
                HTTP {log.httpStatus}
              </Badge>
            )}
            {log.authMode && (
              <Badge variant="outline" className="text-[11px] font-mono">
                {log.authMode}
              </Badge>
            )}
            {log.module && (
              <Badge variant="outline" className="text-[11px]">
                {log.module}
                {log.action ? `·${log.action}` : ""}
              </Badge>
            )}
            {log.capability && (
              <Badge variant="outline" className="text-[11px] font-mono">
                {log.capability}
              </Badge>
            )}
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-0.5">
              <p className="text-muted-foreground">Duração</p>
              <p className="font-mono font-medium">{formatMs(log.durationMs)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2 space-y-0.5">
              <p className="text-muted-foreground">Timestamp</p>
              <p className="font-mono font-medium">{formatDatetime(log.criadoEm)}</p>
            </div>
          </div>

          {/* IDs */}
          <div className="space-y-1.5">
            {log.requestId && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">Request ID</span>
                <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded">{log.requestId}</code>
              </div>
            )}
            {log.idempotencyKey && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">Idempotency Key</span>
                <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded">{log.idempotencyKey}</code>
              </div>
            )}
            {log.apiKeyLast4 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">Chave</span>
                <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded">····{log.apiKeyLast4}</code>
              </div>
            )}
            {log.ipAddress && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">IP</span>
                <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded">{log.ipAddress}</code>
              </div>
            )}
          </div>

          {/* Error */}
          {(log.errorCode || log.errorMessage) && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Erro
                </p>
                {log.errorCode && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-28 shrink-0">Código</span>
                    <code className="font-mono text-[11px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{log.errorCode}</code>
                  </div>
                )}
                {log.errorMessage && (
                  <p className="text-xs text-destructive/90 bg-destructive/10 rounded-lg px-3 py-2">{log.errorMessage}</p>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Payload */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Payload / Params</p>
            <JsonPreview value={log.payload ?? log.params} />
          </div>

          {/* Result */}
          {log.result != null && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Resultado</p>
              <JsonPreview value={log.result} />
            </div>
          )}

          {/* Snapshots */}
          {log.snapshotBefore != null && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Snapshot Before</p>
              <JsonPreview value={log.snapshotBefore} />
            </div>
          )}
          {log.snapshotAfter != null && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Snapshot After</p>
              <JsonPreview value={log.snapshotAfter} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Log row
// ──────────────────────────────────────────────────────────────────────────────

function LogRow({
  log,
  onClick,
}: {
  log: AuditLogItem;
  onClick: () => void;
}) {
  const statusConfig = getStatusConfig(log.status, log.outcome);
  const StatusIcon = statusConfig.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3 hover:bg-muted/40 transition-colors cursor-pointer group"
    >
      {/* Timestamp */}
      <div className="flex flex-col items-start w-36 shrink-0">
        <span className="text-[11px] font-mono text-muted-foreground leading-none">
          {formatDatetime(log.criadoEm)}
        </span>
      </div>

      {/* Key last4 */}
      <div className="w-16 shrink-0">
        {log.apiKeyLast4 ? (
          <span className="text-[11px] font-mono text-muted-foreground">
            ····{log.apiKeyLast4}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Tool */}
      <code className="flex-1 text-xs font-mono text-foreground truncate">
        {log.tool}
      </code>

      {/* Status badge */}
      <div className="w-20 shrink-0 flex justify-center">
        <Badge
          variant="outline"
          className={cn("text-[10px] font-medium", statusConfig.className)}
        >
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusConfig.label}
        </Badge>
      </div>

      {/* Duration */}
      <div className="w-20 shrink-0 text-right">
        <span className="text-[11px] font-mono text-muted-foreground">
          {formatMs(log.durationMs)}
        </span>
      </div>

      {/* Capability */}
      <div className="w-24 shrink-0 text-right hidden sm:block">
        <span className="text-[11px] text-muted-foreground truncate">
          {log.capability ?? "—"}
        </span>
      </div>

      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground -rotate-90 transition-colors shrink-0" />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Filter bar
// ──────────────────────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onFiltersChange,
  onExport,
  isExporting,
}: {
  filters: AuditLogFilters;
  onFiltersChange: (f: AuditLogFilters) => void;
  onExport: () => void;
  isExporting: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasActiveFilters =
    filters.apiKeyId ||
    filters.tool ||
    filters.module ||
    filters.status ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search;

  return (
    <Card className="rounded-xl border border-border bg-muted/30 p-2">
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Row 1: Search + status + export */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar requestId, idempotencyKey…"
              className="pl-8 h-8 text-xs"
              value={filters.search ?? ""}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            />
          </div>
          <Input
            placeholder="Tool (ex: saldo_produto)"
            className="h-8 text-xs w-44"
            value={filters.tool ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, tool: e.target.value || undefined })}
          />
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={filters.status ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || undefined })}
          >
            <option value="">Todos os status</option>
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="denied">denied</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Filter className="h-3 w-3" />
            Filtros
            {hasActiveFilters && (
              <span
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500"
                aria-label="Filtros ativos"
              />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            CSV
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground gap-1"
              onClick={() => onFiltersChange({})}
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Módulo</Label>
              <Input
                placeholder="ex: estoque"
                className="h-8 text-xs w-36"
                value={filters.module ?? ""}
                onChange={(e) => onFiltersChange({ ...filters, module: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">De</Label>
              <Input
                type="datetime-local"
                className="h-8 text-xs w-48"
                value={filters.dateFrom ? filters.dateFrom.slice(0, 16) : ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    dateFrom: e.target.value ? `${e.target.value}:00.000Z` : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Até</Label>
              <Input
                type="datetime-local"
                className="h-8 text-xs w-48"
                value={filters.dateTo ? filters.dateTo.slice(0, 16) : ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    dateTo: e.target.value ? `${e.target.value}:59.999Z` : undefined,
                  })
                }
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Table header
// ──────────────────────────────────────────────────────────────────────────────

function TimelineHeader() {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
      <div className="w-36 shrink-0 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Timestamp
      </div>
      <div className="w-16 shrink-0 flex items-center gap-1">
        <Key className="h-3 w-3" />
        Chave
      </div>
      <div className="flex-1 flex items-center gap-1">
        <Terminal className="h-3 w-3" />
        Tool
      </div>
      <div className="w-20 shrink-0 text-center">Status</div>
      <div className="w-20 shrink-0 text-right flex items-center gap-1 justify-end">
        <Clock className="h-3 w-3" />
        Duração
      </div>
      <div className="w-24 shrink-0 text-right hidden sm:flex items-center gap-1 justify-end">
        <Layers className="h-3 w-3" />
        Capability
      </div>
      <div className="w-5 shrink-0" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  initial: {
    items: AuditLogItem[];
    nextCursor: string | null;
    total: number;
  };
}

export function LogsTimeline({ initial }: Props) {
  const [items, setItems] = useState<AuditLogItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Re-fetch when filters change
  const applyFilters = useCallback((newFilters: AuditLogFilters) => {
    setFilters(newFilters);
    startTransition(async () => {
      const res = await queryAuditLogs(newFilters);
      if (res.success) {
        setItems(res.data.items);
        setNextCursor(res.data.nextCursor);
        setTotal(res.data.total);
      }
    });
  }, []);

  // Load more
  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    const res = await queryAuditLogs(filters, nextCursor);
    if (res.success) {
      setItems((prev) => [...prev, ...res.data.items]);
      setNextCursor(res.data.nextCursor);
    }
    setIsLoadingMore(false);
  };

  // Export CSV
  const handleExport = async () => {
    setIsExporting(true);
    const params = new URLSearchParams();
    if (filters.apiKeyId) params.set("apiKeyId", filters.apiKeyId);
    if (filters.tool) params.set("tool", filters.tool);
    if (filters.module) params.set("module", filters.module);
    if (filters.status) params.set("status", filters.status);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.search) params.set("search", filters.search);
    const url = `/api/integracoes/servidor-mcp/logs/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsExporting(false);
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <FilterBar
        filters={filters}
        onFiltersChange={applyFilters}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* Total counter */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")} registro{total !== 1 ? "s" : ""} no total
        </p>
        {isPending && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando…
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        <TimelineHeader />
        {items.length === 0 && !isPending ? (
          <Card className="rounded-xl border border-border bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Terminal className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum log encontrado para os filtros selecionados.
              </p>
            </CardContent>
          </Card>
        ) : (
          items.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              onClick={() => {
                setSelectedLog(log);
                setDetailOpen(true);
              }}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Carregar mais
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      <LogDetailDrawer
        log={selectedLog}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
