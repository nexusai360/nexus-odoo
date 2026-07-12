"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Database,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { updateSyncConfig } from "@/lib/actions/sync-config";
import {
  updateDiretoriaConfig,
  type DiretoriaConfig,
} from "@/lib/actions/diretoria-config";
import {
  INDICE_ESTOQUE_MIN,
  INDICE_ESTOQUE_MAX,
  INDICE_ESTOQUE_PADRAO,
} from "@/lib/indice-estoque";
import { DatePickerSingle } from "@/components/ui/date-picker-single";
import { CORTE_DADOS_MINIMO } from "@/lib/corte-dados";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { modeloDominio, type FatoModo } from "@/lib/fatos-catalog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Local row type , only the fields the UI uses (avoids importing full Prisma model)
interface SyncStateRow {
  model: string;
  mode: string;
  lastIncrementalAt: Date | null;
  lastSnapshotAt: Date | null;
  lastReconcileAt: Date | null;
  lastStatus: string;
  lastError: string | null;
  recordCount: number;
}

// Mapa de rótulos pt-BR para os tipos de sincronização
const SYNC_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  incremental: { label: "Incremental", description: "mudanças recentes" },
  snapshot: { label: "Completa", description: "espelho completo" },
  estatico: { label: "Estático", description: "dados raros de mudar" },
  reconcile: { label: "Reconciliação", description: "remoções" },
};

// Local row type da camada de fatos (espelha getFatosState; type-only)
interface FatoStateRow {
  nome: string;
  dominio: string;
  modo: FatoModo;
  fonte: string;
  recordCount: number;
  ultimoBuildAt: Date | null;
  status: "ok" | "rodando";
}

interface Config {
  incrementalIntervalMin: number;
  snapshotIntervalMin: number;
  reconcileIntervalMin: number;
  /** Marco zero: a plataforma só considera documentos a partir desta data (AAAA-MM-DD). */
  corteDados: string;
}

/** Só os campos numéricos (os intervalos), que viram inputs de minutos. */
type ConfigIntervalo = Exclude<keyof Config, "corteDados">;

interface Props {
  config: Config;
  diretoria: DiretoriaConfig;
  estado: SyncStateRow[];
  fatos: FatoStateRow[];
}

const FIELD_LABELS: [ConfigIntervalo, string, string, string][] = [
  ["incrementalIntervalMin", "incremental", "Incremental", "Frequência da sincronização incremental (write_date)"],
  ["snapshotIntervalMin", "snapshot", "Completa", "Frequência do snapshot completo (full refresh)"],
  ["reconcileIntervalMin", "reconcile", "Reconciliação", "Frequência da reconciliação (marca registros deletados)"],
];

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "erro":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "sem_acesso":
      return "bg-muted text-muted-foreground border-border";
    case "rodando":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "ok";
    case "erro":
      return "erro";
    case "sem_acesso":
      return "sem acesso";
    case "rodando":
      return "rodando";
    default:
      return status;
  }
}

function formatDateTime(date: Date | null): string {
  if (!date) return ",";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
}

function isFieldValid(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function minToReadable(min: number): string | null {
  if (min < 60) return null;
  const hours = min / 60;
  if (Number.isInteger(hours)) {
    return `${min} min = ${hours} h`;
  }
  return `${min} min ≈ ${hours.toFixed(1)} h`;
}

// ---------------------------------------------------------------------------
// Filtros + ordenacao da tabela de estado
// ---------------------------------------------------------------------------

type SortKey = "model" | "mode" | "status" | "registros" | "ultimaSync";
type SortDir = "asc" | "desc" | null;
type StatusKey = "ok" | "rodando" | "erro" | "sem_acesso";

const STATUS_ORDER_FILTER: StatusKey[] = ["ok", "rodando", "erro", "sem_acesso"];

const STATUS_TAG_ACTIVE: Record<StatusKey, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  rodando: "bg-violet-500/15 text-violet-700 border-violet-500/40 dark:text-violet-300",
  erro: "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-300",
  sem_acesso:
    "bg-slate-500/15 text-slate-700 border-slate-500/40 dark:text-slate-300",
};

function lastSyncAt(row: SyncStateRow): Date | null {
  return row.lastIncrementalAt ?? row.lastSnapshotAt ?? row.lastReconcileAt;
}

function EstadoModal({ estado, fatos, open, onOpenChange }: {
  estado: SyncStateRow[];
  fatos: FatoStateRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Aba ativa: Modelos (camada de ingestão/raw) x Fatos (camada derivada)
  const [tab, setTab] = useState<"modelos" | "fatos">("modelos");
  // Filtros locais (compartilhados; resetados ao trocar de aba)
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([]);
  const [grupoFilter, setGrupoFilter] = useState<string>("all");
  // Ordenacao (3-click: asc -> desc -> null) - default: ultimaSync desc
  const [sortKey, setSortKey] = useState<SortKey>("ultimaSync");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const isModelos = tab === "modelos";

  const changeTab = (t: string) => {
    const next = t === "fatos" ? "fatos" : "modelos";
    if (next === tab) return;
    setTab(next);
    setModeFilter("all");
    setStatusFilter([]);
    setGrupoFilter("all");
    setSortKey("ultimaSync");
    setSortDir("desc");
  };

  // Modos e grupos disponíveis na aba ativa (data-driven)
  const modes = useMemo(() => {
    const set = new Set<string>();
    if (isModelos) for (const r of estado) set.add(r.mode);
    else for (const f of fatos) set.add(f.modo);
    return Array.from(set).sort();
  }, [isModelos, estado, fatos]);

  const grupos = useMemo(() => {
    const set = new Set<string>();
    if (isModelos) for (const r of estado) set.add(modeloDominio(r.model));
    else for (const f of fatos) set.add(f.dominio);
    return Array.from(set).sort();
  }, [isModelos, estado, fatos]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
  };

  const visibleModelos = useMemo(() => {
    let rows = estado.slice();
    if (modeFilter !== "all") rows = rows.filter((r) => r.mode === modeFilter);
    if (statusFilter.length > 0)
      rows = rows.filter((r) => statusFilter.includes(r.lastStatus as StatusKey));
    if (grupoFilter !== "all")
      rows = rows.filter((r) => modeloDominio(r.model) === grupoFilter);
    if (sortDir !== null) {
      const dirSign = sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        if (av === bv) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av < bv ? -1 * dirSign : 1 * dirSign;
      });
    }
    return rows;
  }, [estado, modeFilter, statusFilter, grupoFilter, sortKey, sortDir]);

  const visibleFatos = useMemo(() => {
    let rows = fatos.slice();
    if (modeFilter !== "all") rows = rows.filter((r) => r.modo === modeFilter);
    if (statusFilter.length > 0)
      rows = rows.filter((r) => statusFilter.includes(r.status as StatusKey));
    if (grupoFilter !== "all") rows = rows.filter((r) => r.dominio === grupoFilter);
    if (sortDir !== null) {
      const dirSign = sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = getFatoSortValue(a, sortKey);
        const bv = getFatoSortValue(b, sortKey);
        if (av === bv) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av < bv ? -1 * dirSign : 1 * dirSign;
      });
    }
    return rows;
  }, [fatos, modeFilter, statusFilter, grupoFilter, sortKey, sortDir]);

  // Resumo (descrição) por aba
  const totalCount = isModelos ? estado.length : fatos.length;
  const okCount = isModelos
    ? estado.filter((s) => s.lastStatus === "ok").length
    : fatos.filter((f) => f.status === "ok").length;
  const semAcesso = isModelos
    ? estado.filter((s) => s.lastStatus === "sem_acesso").length
    : 0;
  const erro = isModelos ? estado.filter((s) => s.lastStatus === "erro").length : 0;
  const preparando = isModelos ? 0 : fatos.filter((f) => f.status === "rodando").length;
  const visibleCount = isModelos ? visibleModelos.length : visibleFatos.length;
  const unidade = isModelos ? "modelos" : "fatos";

  const clearFilters = () => {
    setModeFilter("all");
    setStatusFilter([]);
    setGrupoFilter("all");
  };
  const hasActiveFilters =
    modeFilter !== "all" || statusFilter.length > 0 || grupoFilter !== "all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Estado da ingestão</DialogTitle>
          <DialogDescription>
            {totalCount} {unidade}
            {okCount > 0 && ` · ${okCount} ok`}
            {preparando > 0 && ` · ${preparando} preparando`}
            {semAcesso > 0 && ` · ${semAcesso} sem acesso`}
            {erro > 0 && ` · ${erro} com erro`}
            {hasActiveFilters && ` · mostrando ${visibleCount} apos filtros`}
          </DialogDescription>
        </DialogHeader>

        {/* Abas: Modelos (ingestão) x Fatos (derivados do cache) */}
        <div className="pb-1">
          <SegmentedControl
            value={tab}
            onChange={changeTab}
            aria-label="Camada"
            options={[
              { value: "modelos", label: "Modelos" },
              { value: "fatos", label: "Fatos" },
            ]}
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <CustomSelect
            value={modeFilter}
            onChange={setModeFilter}
            triggerClassName="min-h-[36px] h-9 min-w-[160px]"
            aria-label="Filtrar por modo"
            options={[
              { value: "all", label: "Todos os modos" },
              ...modes.map((m) => ({
                value: m,
                label: SYNC_TYPE_LABELS[m]?.label ?? m,
              })),
            ]}
          />
          <StatusMultiSelect
            selected={statusFilter}
            onToggle={(s) =>
              setStatusFilter((prev) =>
                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
              )
            }
            onClear={() => setStatusFilter([])}
          />
          <CustomSelect
            value={grupoFilter}
            onChange={setGrupoFilter}
            triggerClassName="min-h-[36px] h-9 min-w-[160px]"
            aria-label={isModelos ? "Filtrar por grupo" : "Filtrar por domínio"}
            options={[
              { value: "all", label: isModelos ? "Todos os grupos" : "Todos os domínios" },
              ...grupos.map((g) => ({ value: g, label: g })),
            ]}
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Limpar filtros"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Limpar
            </button>
          )}
        </div>

        {isModelos ? (
          estado.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-muted-foreground"
              role="status"
            >
              <Database className="mb-3 h-12 w-12 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm">Nenhum modelo sincronizado ainda.</p>
            </div>
          ) : (
            <div className="overflow-y-auto overflow-x-auto flex-1 -mx-4 px-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableHead label="Modelo" sortKey="model" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortableHead label="Modo" sortKey="mode" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortableHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortableHead label="Registros" sortKey="registros" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                    <SortableHead label="Última sync" sortKey="ultimaSync" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleModelos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                        Nenhum modelo encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleModelos.map((s) => (
                      <TableRow key={s.model} className="border-border hover:bg-muted/30">
                        <TableCell className="font-mono text-xs text-foreground">
                          <div>{s.model}</div>
                          {s.lastStatus === "erro" && s.lastError && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[320px] truncate" title={s.lastError}>
                              {s.lastError}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {SYNC_TYPE_LABELS[s.mode]?.label ?? s.mode}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${getStatusBadgeClasses(s.lastStatus)}`}>
                            {getStatusLabel(s.lastStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {s.recordCount.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(lastSyncAt(s))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )
        ) : fatos.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            role="status"
          >
            <Database className="mb-3 h-12 w-12 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm">Nenhum fato disponível ainda.</p>
          </div>
        ) : (
          <div className="overflow-y-auto overflow-x-auto flex-1 -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead label="Fato" sortKey="model" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortableHead label="Modo" sortKey="mode" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortableHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortableHead label="Registros" sortKey="registros" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortableHead label="Última sync" sortKey="ultimaSync" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFatos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                      Nenhum fato encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleFatos.map((f) => (
                    <TableRow key={f.nome} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-foreground">
                        <div>{f.nome}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          via {f.fonte}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {SYNC_TYPE_LABELS[f.modo]?.label ?? f.modo}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${getStatusBadgeClasses(f.status)}`}>
                          {f.status === "ok" ? "ok" : "preparando"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {f.recordCount.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(f.ultimoBuildAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getSortValue(
  row: SyncStateRow,
  key: SortKey,
): string | number | null {
  switch (key) {
    case "model":
      return row.model;
    case "mode":
      return row.mode;
    case "status":
      return row.lastStatus;
    case "registros":
      return row.recordCount;
    case "ultimaSync": {
      const d = lastSyncAt(row);
      return d ? new Date(d).getTime() : null;
    }
  }
}

function getFatoSortValue(row: FatoStateRow, key: SortKey): string | number | null {
  switch (key) {
    case "model":
      return row.nome;
    case "mode":
      return row.modo;
    case "status":
      return row.status;
    case "registros":
      return row.recordCount;
    case "ultimaSync":
      return row.ultimoBuildAt ? new Date(row.ultimoBuildAt).getTime() : null;
  }
}

interface SortableHeadProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
}

/** TableHead com 3-click cycle de ordenacao: asc -> desc -> sem ordenacao. */
function SortableHead({ label, sortKey, activeKey, dir, onToggle }: SortableHeadProps) {
  const isActive = activeKey === sortKey && dir !== null;
  const Icon =
    !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className="text-xs">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex cursor-pointer select-none items-center gap-1 transition-colors hover:text-foreground",
          isActive ? "text-foreground font-medium" : "text-muted-foreground",
        )}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "h-3 w-3 transition-opacity",
            isActive ? "opacity-100" : "opacity-50",
          )}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

interface StatusMultiSelectProps {
  selected: StatusKey[];
  onToggle: (s: StatusKey) => void;
  onClear: () => void;
}

/** Dropdown multi-select de status com tags coloridas. Padrao alinhado
 *  ao /agente/monitoramento (mesma UX). */
function StatusMultiSelect({ selected, onToggle, onClear }: StatusMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerLabel =
    selected.length === 0
      ? "Status"
      : selected.length === 1
        ? getStatusLabel(selected[0])
        : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por status"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={4}
        className="min-w-[220px] w-auto overflow-hidden p-1"
      >
        <ul role="listbox" aria-label="Status" className="flex flex-col">
          {STATUS_ORDER_FILTER.map((s) => {
            const isOn = selected.includes(s);
            return (
              <li key={s} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isOn}
                  onClick={() => onToggle(s)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors",
                      isOn && "border-violet-500 bg-violet-500 text-white",
                    )}
                    aria-hidden
                  >
                    {isOn ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                      isOn
                        ? STATUS_TAG_ACTIVE[s]
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {getStatusLabel(s)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={onClear}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Retorna o maior Date entre todos os modelos para um campo de data, ou null */
function latestDate(estado: SyncStateRow[], field: keyof Pick<SyncStateRow, "lastIncrementalAt" | "lastSnapshotAt" | "lastReconcileAt">): Date | null {
  let max: Date | null = null;
  for (const row of estado) {
    const val = row[field];
    if (!val) continue;
    const d = new Date(val);
    if (!max || d > max) max = d;
  }
  return max;
}

export function ConfiguracaoContent({ config, diretoria, estado, fatos }: Props) {
  const [form, setForm] = useState<Config>(config);
  const [pending, startTransition] = useTransition();
  const [estadoOpen, setEstadoOpen] = useState(false);

  const ultimasExecucoes: { typeKey: string; label: string; description: string; date: Date | null }[] = [
    { typeKey: "incremental", ...SYNC_TYPE_LABELS.incremental, date: latestDate(estado, "lastIncrementalAt") },
    { typeKey: "snapshot",    ...SYNC_TYPE_LABELS.snapshot,    date: latestDate(estado, "lastSnapshotAt") },
    { typeKey: "reconcile",   ...SYNC_TYPE_LABELS.reconcile,   date: latestDate(estado, "lastReconcileAt") },
  ];

  const dirty =
    form.incrementalIntervalMin !== config.incrementalIntervalMin ||
    form.snapshotIntervalMin !== config.snapshotIntervalMin ||
    form.reconcileIntervalMin !== config.reconcileIntervalMin ||
    form.corteDados !== config.corteDados;

  const valid =
    isFieldValid(form.incrementalIntervalMin) &&
    isFieldValid(form.snapshotIntervalMin) &&
    isFieldValid(form.reconcileIntervalMin);

  function salvar() {
    if (!dirty || !valid) return;
    startTransition(async () => {
      try {
        await updateSyncConfig(form);
        toast.success(
          form.corteDados !== config.corteDados
            ? "Configuração salva. A plataforma passa a considerar dados a partir de " +
                new Date(`${form.corteDados}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })
            : "Intervalos de sincronização atualizados",
        );
      } catch {
        toast.error("Falha ao salvar a configuração");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Intervalos de sincronização
            </CardTitle>
            <CardDescription>
              Em minutos. O worker detecta a mudança e reaplica os intervalos em até 1 minuto.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEstadoOpen(true)}
            className="shrink-0 gap-2 border-border"
          >
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Ver estado da ingestão
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FIELD_LABELS.flatMap(([key, typeKey, label, helper]) => {
              const fieldInvalid = !isFieldValid(form[key]);
              const readable = minToReadable(form[key]);
              const exec = ultimasExecucoes.find((u) => u.typeKey === typeKey);
              const editableCard = (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="relative flex items-center">
                    <Input
                      id={key}
                      type="number"
                      min={1}
                      value={form[key]}
                      aria-invalid={fieldInvalid}
                      className="pr-12"
                      onChange={(e) =>
                        setForm({ ...form, [key]: Number(e.target.value) })
                      }
                    />
                    <span
                      className="pointer-events-none absolute right-3 text-xs text-muted-foreground select-none"
                      aria-hidden="true"
                    >
                      min
                    </span>
                  </div>
                  {fieldInvalid ? (
                    <p className="text-xs text-destructive" role="alert">
                      Informe um valor inteiro maior ou igual a 1.
                    </p>
                  ) : readable ? (
                    <p className="text-xs text-muted-foreground">{readable}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{helper}</p>
                  )}
                  {exec ? (
                    <p className="text-[11px] text-muted-foreground/80">
                      Última execução:{" "}
                      <span className="tabular-nums">
                        {exec.date ? formatDateTime(exec.date) : ","}
                      </span>
                    </p>
                  ) : null}
                </div>
              );
              // Apos Completa (snapshot), insere card read-only do Estatico
              // pra manter ordem: Incremental -> Completa -> Estatico -> Reconciliacao.
              if (key === "snapshotIntervalMin") {
                const execEst = latestDate(estado, "lastSnapshotAt");
                const estaticoCard = (
                  <div
                    key="estatico-readonly"
                    className="flex flex-col gap-1.5 opacity-80"
                  >
                    <Label>Estático</Label>
                    <div className="relative flex items-center">
                      <Input
                        type="number"
                        value={form.snapshotIntervalMin}
                        readOnly
                        disabled
                        className="pr-12 cursor-not-allowed"
                        aria-label="Estatico (compartilha com Completa)"
                      />
                      <span
                        className="pointer-events-none absolute right-3 text-xs text-muted-foreground select-none"
                        aria-hidden="true"
                      >
                        min
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      segue o intervalo da Completa (dados raros de mudar)
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Última execução:{" "}
                      <span className="tabular-nums">
                        {execEst ? formatDateTime(execEst) : ","}
                      </span>
                    </p>
                  </div>
                );
                return [editableCard, estaticoCard];
              }
              return [editableCard];
            })}
          </div>

          {/* Marco zero da plataforma: a data manda em tudo (faturamento, estoque, contas,
              entregas, relatórios e agente Nex). Fica junto do Salvar, no mesmo card. */}
          <div className="border-t border-border/60 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="corte-dados">Analisar dados a partir de</Label>
                <DatePickerSingle
                  id="corte-dados"
                  value={form.corteDados}
                  onChange={(iso) => setForm((f) => ({ ...f, corteDados: iso }))}
                  minIso={CORTE_DADOS_MINIMO}
                />
              </div>
              {/* Duas linhas do mesmo tamanho: `text-balance` distribui o texto e a quebra cai
                  naturalmente depois de "contas,". Antes sobrava um "no cache." órfão embaixo. */}
              <p className="max-w-lg flex-1 text-xs leading-relaxed text-balance text-muted-foreground sm:pt-8">
                Define o início de tudo o que a plataforma analisa: faturamento, estoque, contas,
                entregas, relatórios e o Agente Nex. Nada é apagado: o histórico fica no cache.
              </p>
            </div>
          </div>

          <Button onClick={salvar} disabled={!dirty || !valid || pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>

      <CardDiretoriaVendas inicial={diretoria} />

      <EstadoModal
        estado={estado}
        fatos={fatos}
        open={estadoOpen}
        onOpenChange={setEstadoOpen}
      />
    </motion.div>
  );
}


// ---------------------------------------------------------------------------
// Diretoria > Vendas , o índice de valorização do estoque
//
// O KPI "Valor em estoque" mostra o valor a custo DIVIDIDO por este índice (padrão 0,95).
// Fica aqui, e não no bloco de sincronização, porque é regra de NEGÓCIO da diretoria, não
// de ingestão.
// ---------------------------------------------------------------------------

function CardDiretoriaVendas({ inicial }: { inicial: DiretoriaConfig }) {
  const [indice, setIndice] = useState<string>(String(inicial.indiceValorEstoque));
  const [pendente, startTransition] = useTransition();

  const valor = Number(indice.replace(",", "."));
  const valido =
    Number.isFinite(valor) && valor >= INDICE_ESTOQUE_MIN && valor <= INDICE_ESTOQUE_MAX;
  const mudou = valido && valor !== inicial.indiceValorEstoque;

  function salvarIndice() {
    if (!mudou || !valido) return;
    startTransition(async () => {
      try {
        await updateDiretoriaConfig({ indiceValorEstoque: valor });
        toast.success(`Índice salvo. O valor em estoque passa a ser dividido por ${valor}.`);
      } catch {
        toast.error("Falha ao salvar o índice");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          Diretoria · Vendas
        </CardTitle>
        <CardDescription>
          Regras de negócio dos indicadores da diretoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="indice-estoque">Índice do valor em estoque</Label>
            <Input
              id="indice-estoque"
              inputMode="decimal"
              value={indice}
              onChange={(e) => setIndice(e.target.value)}
              aria-invalid={!valido}
              className="h-10 w-40 tabular-nums"
            />
          </div>
          <p className="max-w-lg flex-1 text-xs leading-relaxed text-balance text-muted-foreground sm:pt-8">
            O valor do estoque a custo é dividido por este índice, e é o resultado que aparece
            no KPI. Padrão {INDICE_ESTOQUE_PADRAO.toLocaleString("pt-BR")}. O valor sem a
            divisão continua visível no card, embaixo.
          </p>
        </div>
        {!valido && (
          <p role="alert" className="text-xs text-destructive">
            Use um número entre {INDICE_ESTOQUE_MIN} e {INDICE_ESTOQUE_MAX}.
          </p>
        )}
        <Button onClick={salvarIndice} disabled={!mudou || pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
