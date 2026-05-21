"use client";

import { useCallback, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Plug,
  Search,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import {
  formatDatetime,
  formatMs,
  isEmptyValue,
  JsonBlock,
  DetailField,
} from "@/components/integracoes/log-primitives";
import {
  queryExternalMcpCallLogs,
  type ExternalMcpCallLogItem,
  type ExternalMcpCallLogsPage,
  type ExternalMcpCallLogFilters,
} from "@/lib/actions/external-mcp-call-log";

interface Props {
  initial: ExternalMcpCallLogsPage;
  servers: { id: string; name: string }[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Status (o log externo só tem ok/error)
// ──────────────────────────────────────────────────────────────────────────────

function statusConfig(outcome: string) {
  if (outcome === "ok") {
    return {
      label: "Sucesso",
      Icon: CheckCircle2,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  return {
    label: "Erro",
    Icon: XCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Período
// ──────────────────────────────────────────────────────────────────────────────

type Period = "tudo" | "hoje" | "7d" | "30d";

function rangeFor(p: Period): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (p === "tudo") return {};
  if (p === "hoje") {
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    return { dateFrom: s.toISOString(), dateTo: now.toISOString() };
  }
  const days = p === "7d" ? 7 : 30;
  return {
    dateFrom: new Date(now.getTime() - days * 86400000).toISOString(),
    dateTo: now.toISOString(),
  };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Detalhe e linha
// ──────────────────────────────────────────────────────────────────────────────

function LogDetail({ log }: { log: ExternalMcpCallLogItem }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold font-mono">{log.toolName}</p>
        <p className="text-xs text-muted-foreground">
          Chamada do Agente Nex ao servidor MCP externo {log.serverName}.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DetailField label="Servidor" value={log.serverName} />
        <DetailField label="Timestamp" value={formatDatetime(log.criadoEm)} mono />
        <DetailField label="Duração" value={formatMs(log.durationMs)} mono />
      </div>

      {log.outcome === "error" && (
        <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Erro na chamada
          </p>
          <p className="text-xs text-destructive opacity-90">
            {log.errorMessage ??
              "A chamada ao servidor MCP externo falhou. Verifique se o servidor está no ar e a autenticação."}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Parâmetros da chamada</p>
        {isEmptyValue(log.argsPreview) ? (
          <p className="text-xs text-muted-foreground italic">Sem parâmetros.</p>
        ) : (
          <JsonBlock value={log.argsPreview} />
        )}
      </div>
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: ExternalMcpCallLogItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = statusConfig(log.outcome);
  const StatusIcon = status.Icon;

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
        <code className="flex-1 min-w-0 text-sm font-mono truncate">{log.toolName}</code>
        {/* Coluna de largura fixa: alinha a tag, mas o badge se ajusta ao texto. */}
        <span className="hidden sm:flex w-[140px] shrink-0">
          <span className="inline-flex max-w-full items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">
            <span className="truncate">{log.serverName}</span>
          </span>
        </span>
        <span
          className={cn(
            "inline-flex w-[96px] shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            status.className,
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {status.label}
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
          <LogDetail log={log} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ExternalMcpLogs
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "ok", label: "Sucesso" },
  { value: "error", label: "Erro" },
];

export function ExternalMcpLogs({ initial, servers }: Props) {
  const [items, setItems] = useState<ExternalMcpCallLogItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [serverId, setServerId] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>("tudo");

  const buildFilters = useCallback(
    (over?: Partial<{ search: string; serverId: string; status: string; period: Period }>) => {
      const s = over?.search ?? search;
      const sv = over?.serverId ?? serverId;
      const st = over?.status ?? status;
      const pe = over?.period ?? period;
      const filters: ExternalMcpCallLogFilters = { ...rangeFor(pe) };
      if (s.trim()) filters.search = s.trim();
      if (sv) filters.serverId = sv;
      if (st) filters.status = st;
      return filters;
    },
    [search, serverId, status, period],
  );

  const apply = useCallback(
    (filters: ExternalMcpCallLogFilters) => {
      setExpandedId(null);
      startTransition(async () => {
        const res = await queryExternalMcpCallLogs(filters);
        if (res.success) {
          setItems(res.data.items);
          setNextCursor(res.data.nextCursor);
          setTotal(res.data.total);
        }
      });
    },
    [],
  );

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    const res = await queryExternalMcpCallLogs(buildFilters(), nextCursor);
    if (res.success) {
      setItems((prev) => [...prev, ...res.data.items]);
      setNextCursor(res.data.nextCursor);
    }
    setIsLoadingMore(false);
  }

  const serverOptions = [
    { value: "", label: "Todos os servidores" },
    ...servers.map((s) => ({ value: s.id, label: s.name })),
  ];

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium transition-colors",
      active
        ? "bg-violet-600 text-white"
        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    );

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Nota explicativa: o que são estes logs */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            Registro de chamadas a MCPs externos.
          </span>{" "}
          Cada linha é uma chamada que o Agente Nex fez a uma tool de um servidor MCP
          externo conectado aqui no Plugar MCP, e a lista reflete só chamadas que
          realmente aconteceram.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por tool"
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                apply(buildFilters({ search: e.target.value }));
              }}
            />
          </div>
          <div className="w-52">
            <CustomSelect
              aria-label="Filtrar por servidor"
              value={serverId}
              onChange={(v) => {
                setServerId(v);
                apply(buildFilters({ serverId: v }));
              }}
              options={serverOptions}
            />
          </div>
          <div className="w-44">
            <CustomSelect
              aria-label="Filtrar por status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                apply(buildFilters({ status: v }));
              }}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Período
          </span>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={pill(period === p.value)}
              onClick={() => {
                setPeriod(p.value);
                apply(buildFilters({ period: p.value }));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
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
          <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma chamada a MCP externo registrada.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            As chamadas do Agente Nex aos servidores conectados aparecem aqui assim que
            ocorrem.
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
