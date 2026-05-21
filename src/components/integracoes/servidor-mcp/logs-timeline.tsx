"use client";

import { useState, useTransition, useCallback } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  Loader2,
  Search,
  Shield,
  Terminal,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { moduleLabel } from "@/lib/mcp-module-labels";
import {
  queryAuditLogs,
  type AuditLogItem,
  type AuditLogFilters,
} from "@/lib/actions/mcp-audit-query";

// ──────────────────────────────────────────────────────────────────────────────
// Status config
// ──────────────────────────────────────────────────────────────────────────────

function getStatusConfig(status: string | null, outcome: string) {
  const s = (status ?? outcome ?? "").toLowerCase();
  if (s === "success" || s === "ok" || outcome === "success")
    return {
      label: "Sucesso",
      icon: CheckCircle2,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  if (s === "error" || s === "failed" || outcome === "error")
    return {
      label: "Erro",
      icon: XCircle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  if (s === "denied" || s === "forbidden")
    return {
      label: "Negado",
      icon: Shield,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  if (s === "invalid_input" || s === "invalid" || s === "validation_error")
    return {
      label: "Inválido",
      icon: AlertTriangle,
      className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    };
  return {
    label: s || "-",
    icon: Info,
    className: "border-border bg-muted/40 text-muted-foreground",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function formatMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 max-h-72 overflow-auto">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Detalhe inline
// ──────────────────────────────────────────────────────────────────────────────

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={cn("text-xs", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function LogDetail({ log, description }: { log: AuditLogItem; description?: string }) {
  const payload = log.payload ?? log.params;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold font-mono">{log.tool}</p>
        <p className="text-xs text-muted-foreground">
          {description ?? "Chamada registrada no servidor MCP."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DetailField label="Timestamp" value={formatDatetime(log.criadoEm)} mono />
        <DetailField label="Duração" value={formatMs(log.durationMs)} mono />
        {log.requestId && <DetailField label="Request ID" value={log.requestId} mono />}
        {log.idempotencyKey && (
          <DetailField label="Idempotency Key" value={log.idempotencyKey} mono />
        )}
        {log.apiKeyLast4 && <DetailField label="Chave" value={`····${log.apiKeyLast4}`} mono />}
        {log.authMode && <DetailField label="Modo de auth" value={log.authMode} mono />}
        {log.module && (
          <DetailField
            label="Módulo e ação"
            value={
              log.action
                ? `${moduleLabel(log.module)}, ${log.action}`
                : moduleLabel(log.module)
            }
          />
        )}
        {log.capability && <DetailField label="Capability" value={log.capability} mono />}
        {log.httpStatus && <DetailField label="HTTP" value={String(log.httpStatus)} mono />}
        {log.ipAddress && <DetailField label="IP" value={log.ipAddress} mono />}
      </div>

      {(log.errorCode || log.errorMessage) && (
        <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Erro {log.errorCode ? `, ${log.errorCode}` : ""}
          </p>
          {log.errorMessage && <p className="text-xs text-destructive/90">{log.errorMessage}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Parâmetros da chamada</p>
        {isEmptyValue(payload) ? (
          <p className="text-xs text-muted-foreground italic">Sem parâmetros.</p>
        ) : (
          <JsonBlock value={payload} />
        )}
      </div>

      {!isEmptyValue(log.result) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Resultado</p>
          <JsonBlock value={log.result} />
        </div>
      )}

      {!isEmptyValue(log.snapshotBefore) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Snapshot antes</p>
          <JsonBlock value={log.snapshotBefore} />
        </div>
      )}
      {!isEmptyValue(log.snapshotAfter) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Snapshot depois</p>
          <JsonBlock value={log.snapshotAfter} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Linha de log
// ──────────────────────────────────────────────────────────────────────────────

function LogRow({
  log,
  expanded,
  onToggle,
  description,
}: {
  log: AuditLogItem;
  expanded: boolean;
  onToggle: () => void;
  description?: string;
}) {
  const statusConfig = getStatusConfig(log.status, log.outcome);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <span className="text-xs font-mono text-muted-foreground w-28 shrink-0">
          {formatDatetime(log.criadoEm)}
        </span>
        <code className="flex-1 text-sm font-mono truncate">{log.tool}</code>
        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0 text-right hidden sm:block">
          {log.apiKeyLast4 ? `····${log.apiKeyLast4}` : "-"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0",
            statusConfig.className,
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </span>
        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0 text-right">
          {formatMs(log.durationMs)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1">
          <LogDetail log={log} description={description} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Período: presets e cálculo de faixa
// ──────────────────────────────────────────────────────────────────────────────

type PeriodPreset = "tudo" | "hoje" | "7d" | "30d" | "custom";

function rangeForPreset(preset: PeriodPreset): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (preset === "tudo") return { dateFrom: undefined, dateTo: undefined };
  if (preset === "hoje") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  return {};
}

const PERIOD_PRESETS: { preset: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { preset: "tudo", label: "Tudo" },
  { preset: "hoje", label: "Hoje" },
  { preset: "7d", label: "7 dias" },
  { preset: "30d", label: "30 dias" },
];

// Os valores batem com a coluna `outcome` gravada no audit log.
const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "ok", label: "Sucesso" },
  { value: "error", label: "Erro" },
  { value: "denied", label: "Negado" },
  { value: "invalid_input", label: "Inválido" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Barra de filtros
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
  const [preset, setPreset] = useState<PeriodPreset>("tudo");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState(false);

  function applyPreset(p: Exclude<PeriodPreset, "custom">) {
    setPreset(p);
    onFiltersChange({ ...filters, ...rangeForPreset(p) });
  }

  function applyCustom() {
    if (!customFrom && !customTo) return;
    const from = customFrom ? new Date(customFrom) : undefined;
    const to = customTo ? new Date(customTo) : undefined;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);
    setPreset("custom");
    setCustomOpen(false);
    onFiltersChange({
      ...filters,
      dateFrom: from?.toISOString(),
      dateTo: to?.toISOString(),
    });
  }

  const pillClass = (active: boolean) =>
    cn(
      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
      "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
      active
        ? "bg-violet-600 text-white"
        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    );

  return (
    <div
      data-tour="mcp-logs-filtros"
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      {/* Busca, status e exportar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por tool, requestId ou idempotency-key"
            className="pl-8 h-9 text-sm"
            value={filters.search ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
          />
        </div>
        <div className="w-44">
          <CustomSelect
            aria-label="Filtrar por status"
            value={filters.status ?? ""}
            onChange={(v) => onFiltersChange({ ...filters, status: v || undefined })}
            options={STATUS_OPTIONS}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          CSV
        </Button>
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
          Período
        </span>
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.preset}
            type="button"
            className={pillClass(preset === p.preset)}
            onClick={() => applyPreset(p.preset)}
          >
            {p.label}
          </button>
        ))}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger
            render={
              <button type="button" className={pillClass(preset === "custom")}>
                <CalendarDays className="h-3.5 w-3.5" />
                Personalizado
              </button>
            }
          />
          <PopoverContent align="start" sideOffset={4} className="w-72 space-y-3">
            <p className="text-sm font-medium">Intervalo personalizado</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">De</Label>
              <DateField value={customFrom} onChange={setCustomFrom} placeholder="Data inicial" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <DateField value={customTo} onChange={setCustomTo} placeholder="Data final" />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={applyCustom}
              disabled={!customFrom && !customTo}
            >
              Aplicar intervalo
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  initial: {
    items: AuditLogItem[];
    nextCursor: string | null;
    total: number;
  };
  /** Mapa nome da tool -> descrição, para o detalhe explicar o que a chamada faz. */
  toolDescriptions?: Record<string, string>;
}

export function LogsTimeline({ initial, toolDescriptions = {} }: Props) {
  const [items, setItems] = useState<AuditLogItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const applyFilters = useCallback((newFilters: AuditLogFilters) => {
    setFilters(newFilters);
    setExpandedId(null);
    startTransition(async () => {
      const res = await queryAuditLogs(newFilters);
      if (res.success) {
        setItems(res.data.items);
        setNextCursor(res.data.nextCursor);
        setTotal(res.data.total);
      }
    });
  }, []);

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

  const handleExport = async () => {
    setIsExporting(true);
    const params = new URLSearchParams();
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

      <div data-tour="mcp-logs-lista" className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")} registro{total !== 1 ? "s" : ""}
        </p>
        {isPending && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando
          </span>
        )}
      </div>

      {items.length === 0 && !isPending ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <Terminal className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma chamada registrada para os filtros selecionados.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            As chamadas ao servidor MCP aparecem aqui assim que ocorrem.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId((id) => (id === log.id ? null : log.id))}
              description={toolDescriptions[log.tool]}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
