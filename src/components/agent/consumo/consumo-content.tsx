"use client";

/**
 * ConsumoContent , componente cliente raiz da tela /agente/consumo.
 *
 * Clone do front-end da tela de consumo do Agente Nex do nexus-insights,
 * reconectado ao back-end V2 do nexus-odoo (UsageSummaryV2: conversas vs
 * iterações, costKnown, requestKind, rateStale). Ver
 * docs/superpowers/specs/2026-05-22-consumo-nex-clone-design.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  Coins,
  DollarSign,
  Hash,
  History,
  Loader2,
  MessageSquare,
  Sparkles,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomSelect } from "@/components/ui/custom-select";
import { KpiCard } from "@/components/reports/kpi-card";
import { PeriodPills } from "@/components/reports/period-pills";
import { PeriodNavigator } from "@/components/dashboard/period-navigator";
import {
  InteractiveAreaChart,
  InteractiveBarChart,
  DonutWithCenter,
  type AreaChartData,
  type BarChartData,
  type PieChartData,
} from "@/components/charts/interactive";
import { CHART_COLORS, getColorByIndex } from "@/components/charts/colors";
import { cn } from "@/lib/utils";
import {
  fetchDistinctModels,
  fetchDistinctProviders,
  fetchUsageDetails,
  fetchUsageStats,
} from "@/lib/actions/llm-usage";
import type {
  UsageDetailRow,
  UsageDetailsTotals,
  UsageSummaryV2,
} from "@/lib/agent/llm/usage-stats";
import { providerLabel } from "@/lib/agent/llm/provider-labels";
import {
  formatBrl4,
  formatUsd4,
  formatDuration,
  formatCompactCount,
} from "@/lib/agent/llm/format";
import {
  getPeriodInTz,
  getCanonicalPeriod,
  type PeriodKey,
  type CanonicalPeriodLabel,
} from "@/lib/datetime-core";
import { UsageDetailInline } from "./usage-detail-inline";
import { UsageTableFilters } from "./usage-table-filters";

// ---------------------------------------------------------------------------
// Tipos / constantes
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

type Ambiente = "all" | "agente" | "playground";

interface ConsumoContentProps {
  /** ISO string da primeira chamada (ou início do mês corrente). */
  minDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function rangeForPills(
  pill: PeriodKey,
  customRange: { start: string; end: string } | undefined,
  minDate: Date,
): { start: Date; end: Date } {
  // "todos" → corta a partir do minDate (1ª chamada do banco) até agora.
  if (pill === "todos") {
    return { start: minDate, end: new Date() };
  }
  if (pill === "custom" && customRange) {
    const start = isoLocalToDate(customRange.start);
    const end = isoLocalToDate(customRange.end);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return getPeriodInTz(pill, TZ);
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR");
// Moeda "bruta" para a tabela: 2 a 6 casas decimais (exibe valores muito
// pequenos sem perder precisão).
const usdRawFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const brlRawFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
// Formato compacto dd/mm para legendas e ticks do eixo X (melhor aproveitamento
// de espaco horizontal, especialmente no grafico mensal).
const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

function formatUsdRaw(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ",";
  return usdRawFmt.format(v);
}

function formatBrlRaw(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ",";
  return brlRawFmt.format(v);
}

function formatTokens(v: number): string {
  return formatCompactCount(v);
}

function isWhisperModel(model: string): boolean {
  return /whisper/i.test(model);
}

// Coluna "Tipo" , estilos e rótulos do requestKind (dado próprio do nexus-odoo).
const REQUEST_KIND_STYLES: Record<string, string> = {
  texto: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  imagem: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  audio: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  arquivo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  embedding: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};
const REQUEST_KIND_LABELS: Record<string, string> = {
  texto: "Texto",
  imagem: "Imagem",
  audio: "Áudio",
  arquivo: "Arquivo",
  embedding: "Embedding",
};

// Coluna "Origem" , quando a linha tem `origin` explícito (router), usa este
// mapa; senão cai no derivado de isPlayground (Agente Nex / Playground).
const ORIGIN_STYLES: Record<string, string> = {
  router: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  router_calibracao: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};
const ORIGIN_LABELS: Record<string, string> = {
  router: "Router",
  router_calibracao: "Router (calibragem)",
};

// ---------------------------------------------------------------------------
// Full-period chart helpers
// ---------------------------------------------------------------------------

function currentHourInBrt(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "23", 10);
  return Number.isNaN(h) || h === 24 ? 0 : h;
}

function todayIsoInBrt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function dateIsoInBrt(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

function buildHourlyFullPeriod(
  stats: UsageSummaryV2 | null,
  /** Quando o grafico mostra o dia de hoje, marca horas futuras; em dias
   *  passados, todas as 24 horas sao validas. */
  isToday: boolean,
): AreaChartData[] {
  const cutoffHour = isToday ? currentHourInBrt() : 23;
  const map = new Map<number, number>();
  for (const h of stats?.byHour ?? []) map.set(h.hour, h.costBrl);
  return Array.from({ length: 24 }, (_, hour) => {
    const isFuture = hour > cutoffHour;
    const hh = String(hour).padStart(2, "0");
    return {
      name: `${hh}:00`,
      tooltipLabel: `${hh}:00 - ${hh}:59`,
      Custo: isFuture ? null : Number((map.get(hour) ?? 0).toFixed(6)),
      isFuture,
    };
  });
}

function buildDailyFullPeriod(
  stats: UsageSummaryV2 | null,
  rangeStart: Date,
  rangeEnd: Date,
): AreaChartData[] {
  const todayIso = todayIsoInBrt();
  const map = new Map<string, number>();
  for (const d of stats?.byDay ?? []) map.set(d.day, d.costBrl);

  const rows: AreaChartData[] = [];
  let curIso = dateIsoInBrt(rangeStart);
  const endIso = dateIsoInBrt(rangeEnd);

  while (curIso < endIso) {
    const isFuture = curIso > todayIso;
    rows.push({
      name: dayLabelFmt.format(isoLocalToDate(curIso)).replace(".", ""),
      Custo: isFuture ? null : Number((map.get(curIso) ?? 0).toFixed(6)),
      isFuture,
    });
    const [y, m, d] = curIso.split("-").map(Number);
    const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
    curIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ConsumoContent({ minDate: minDateIso }: ConsumoContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const minDate = useMemo(() => new Date(minDateIso), [minDateIso]);

  const [pill, setPill] = useState<PeriodKey>("mes_atual");
  const [customRange, setCustomRange] = useState<
    { start: string; end: string } | undefined
  >();

  const [stats, setStats] = useState<UsageSummaryV2 | null>(null);
  const [details, setDetails] = useState<UsageDetailRow[]>([]);
  const [detailsTotal, setDetailsTotal] = useState(0);
  const [detailsTotals, setDetailsTotals] = useState<UsageDetailsTotals | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  // Filtros globais (afetam KPIs, charts e tabela). Sincronizam com URL.
  const [globalProvider, setGlobalProvider] = useState<string | undefined>(
    undefined,
  );
  const [globalModel, setGlobalModel] = useState<string | undefined>(undefined);
  const [filterProvider, setFilterProvider] = useState<string | undefined>(
    undefined,
  );
  const [filterModel, setFilterModel] = useState<string | undefined>();
  // Filtro Ambiente GLOBAL (Agente Nex / Playground). Sincroniza com URL
  // ?env=... e cascateia para o filterAmbiente da tabela.
  const [ambiente, setAmbiente] = useState<Ambiente>("all");
  // Filtro Ambiente LOCAL da tabela (espelha o global por padrao; usuario
  // pode sobrepor diretamente no card "Historico de chamadas"). Mesmo
  // comportamento dos filtros local de provider/model.
  const [filterAmbiente, setFilterAmbiente] = useState<Ambiente>("all");
  // O estado inicial dos filtros vem da URL, mas só pode ser lido após a
  // montagem no client , ler window.location no primeiro render quebraria a
  // hidratação (o servidor não tem a query string).
  const [hydrated, setHydrated] = useState(false);
  const isPlaygroundFilter =
    ambiente === "all" ? null : ambiente === "playground";
  // Variante por tabela: usa o filterAmbiente local (que segue o global por
  // default). Mantemos separado para o histórico aceitar override próprio
  // sem mexer nos KPIs/charts.
  const isPlaygroundFilterTable =
    filterAmbiente === "all" ? null : filterAmbiente === "playground";
  const [providers, setProviders] = useState<string[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<
    Record<string, string[]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Navegação do gráfico "Custo por dia"
  const [chartReferenceDate, setChartReferenceDate] = useState<string | null>(
    null,
  );
  const [chartStats, setChartStats] = useState<UsageSummaryV2 | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);

  // Calcula intervalo efetivo a partir da pill atual.
  const range = useMemo(
    () => rangeForPills(pill, customRange, minDate),
    [pill, customRange, minDate],
  );

  // Reseta paginação ao trocar período / filtros / pageSize.
  useEffect(() => {
    setPage(0);
  }, [
    pill,
    customRange,
    globalProvider,
    globalModel,
    filterProvider,
    filterModel,
    ambiente,
    pageSize,
  ]);

  // Reset navegação do gráfico ao trocar pill.
  useEffect(() => {
    setChartReferenceDate(null);
    setChartStats(null);
  }, [pill]);

  // Mapeamento pill → tipo de navegação do gráfico.
  const navigatorPeriod: "dia" | "semana" | "mes" | null =
    pill === "hoje"
      ? "dia"
      : pill === "semana_atual"
        ? "semana"
        : pill === "mes_atual"
          ? "mes"
          : null;

  // Label canônico para getCanonicalPeriod.
  const canonicalLabel: CanonicalPeriodLabel | null =
    pill === "hoje"
      ? "hoje"
      : pill === "semana_atual"
        ? "semana"
        : pill === "mes_atual"
          ? "mes"
          : null;

  // Range efetivo do gráfico (main range ou range navegado).
  const effectiveChartRange = useMemo(() => {
    if (!canonicalLabel || !chartReferenceDate) return range;
    const cp = getCanonicalPeriod({
      label: canonicalLabel,
      tz: TZ,
      refIso: chartReferenceDate,
      weekStartsOn: 1,
    });
    return { start: cp.start, end: cp.end };
  }, [canonicalLabel, chartReferenceDate, range]);

  // Próximo período disponível quando o range do gráfico termina antes de agora.
  const chartNextAvailable = effectiveChartRange.end < new Date();

  // Range "drill-down": quando o usuario navega via PeriodNavigator do
  // grafico, o resto da pagina (histórico de chamadas) acompanha. Sem
  // navegacao ativa, usa o periodo da pill.
  const effectiveDetailsRange = useMemo(
    () => (chartReferenceDate ? effectiveChartRange : range),
    [chartReferenceDate, effectiveChartRange, range],
  );

  const drillLabel = useMemo<string | null>(() => {
    if (!chartReferenceDate) return null;
    try {
      const fmtDay = new Intl.DateTimeFormat("pt-BR", {
        timeZone: TZ,
        day: "2-digit",
        month: "2-digit",
      });
      // end vem end-exclusive (proximo 00:00 BRT). Para exibicao, mostramos
      // o ultimo dia inclusivo (end - 1 ms).
      const endInclusive = new Date(effectiveChartRange.end.getTime() - 1);
      const s = fmtDay.format(effectiveChartRange.start);
      const e = fmtDay.format(endInclusive);
      return s === e ? s : `${s} - ${e}`;
    } catch {
      return null;
    }
  }, [chartReferenceDate, effectiveChartRange]);

  // Fetch separado de stats para o gráfico quando navegando.
  useEffect(() => {
    if (!chartReferenceDate || !canonicalLabel) {
      setChartStats(null);
      setIsChartLoading(false);
      return;
    }
    let cancelled = false;
    setIsChartLoading(true);
    fetchUsageStats({
      start: effectiveChartRange.start.toISOString(),
      end: effectiveChartRange.end.toISOString(),
      provider: globalProvider ?? null,
      model: globalModel ?? null,
      isPlayground: isPlaygroundFilter,
    })
      .then((s) => {
        if (!cancelled) {
          setChartStats(s);
          setIsChartLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReferenceDate, effectiveChartRange.start.getTime(), effectiveChartRange.end.getTime(), globalProvider, globalModel, isPlaygroundFilter]);

  // Lê o estado inicial dos filtros da URL , só após a montagem no client,
  // para o primeiro render bater com o do servidor (evita hydration mismatch).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider") ?? undefined;
    if (provider) setGlobalProvider(provider);
    const modelParam = params.get("model") ?? undefined;
    if (modelParam) setGlobalModel(modelParam);
    const env = params.get("env");
    if (env === "playground" || env === "agente") setAmbiente(env);
    setHydrated(true);
  }, []);

  // Sincroniza filtro global com URL (?provider=...). Só depois da leitura
  // inicial, para não apagar a query string antes de lê-la.
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    if (globalProvider) url.searchParams.set("provider", globalProvider);
    else url.searchParams.delete("provider");
    window.history.replaceState({}, "", url.toString());
  }, [globalProvider, hydrated]);

  // Sincroniza filtro de Modelo global com URL (?model=...).
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    if (globalModel) url.searchParams.set("model", globalModel);
    else url.searchParams.delete("model");
    window.history.replaceState({}, "", url.toString());
  }, [globalModel, hydrated]);

  // Sincroniza filtro Ambiente com URL (?env=...).
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    if (ambiente === "all") url.searchParams.delete("env");
    else url.searchParams.set("env", ambiente);
    window.history.replaceState({}, "", url.toString());
  }, [ambiente, hydrated]);

  // Quando os filtros globais mudam, espelha nos filtros da tabela.
  // - globalProvider muda -> filterProvider segue, filterModel reseta
  //   (modelo da tabela deixa de fazer sentido com novo provider).
  // - globalModel muda -> filterModel segue (sobrepoe selecao local).
  useEffect(() => {
    setFilterProvider(globalProvider);
    setFilterModel(undefined);
  }, [globalProvider]);
  useEffect(() => {
    setFilterModel(globalModel);
  }, [globalModel]);
  // Ambiente global -> Ambiente local da tabela.
  useEffect(() => {
    setFilterAmbiente(ambiente);
  }, [ambiente]);

  // Fetch stats + first page de details.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsLoading(true);
    const run = async () => {
      try {
        const startIso = range.start.toISOString();
        const endIso = range.end.toISOString();
        const detStartIso = effectiveDetailsRange.start.toISOString();
        const detEndIso = effectiveDetailsRange.end.toISOString();
        const [s, d] = await Promise.all([
          fetchUsageStats({
            start: startIso,
            end: endIso,
            provider: globalProvider ?? null,
            model: globalModel ?? null,
            isPlayground: isPlaygroundFilter,
          }),
          fetchUsageDetails({
            start: detStartIso,
            end: detEndIso,
            limit: pageSize,
            offset: page * pageSize,
            provider: filterProvider ?? null,
            model: filterModel ?? null,
            isPlayground: isPlaygroundFilterTable,
          }),
        ]);
        if (cancelled) return;
        setStats(s);
        setDetails(d.rows);
        setDetailsTotal(d.total);
        setDetailsTotals(d.totals);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Falha ao carregar dados.";
        setError(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), effectiveDetailsRange.start.getTime(), effectiveDetailsRange.end.getTime(), page, pageSize, globalProvider, globalModel, filterProvider, filterModel, isPlaygroundFilter, filterAmbiente]);

  // Fetch lista de providers no range (para filtros cascade).
  useEffect(() => {
    let cancelled = false;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    fetchDistinctProviders({ start: startIso, end: endIso })
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  // Fetch modelos no range, agrupados por provider (cascade dos filtros).
  useEffect(() => {
    let cancelled = false;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    async function load() {
      if (providers.length === 0) {
        if (!cancelled) setModelsByProvider({});
        return;
      }
      try {
        const entries = await Promise.all(
          providers.map(async (p) => {
            const list = await fetchDistinctModels({
              start: startIso,
              end: endIso,
              provider: p,
            });
            return [p, list] as const;
          }),
        );
        if (cancelled) return;
        const map: Record<string, string[]> = {};
        for (const [p, list] of entries) map[p] = list;
        setModelsByProvider(map);
      } catch {
        if (!cancelled) setModelsByProvider({});
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [providers, range.start, range.end]);

  const handlePeriodChange = useCallback(
    (next: PeriodKey, nextRange?: { start: string; end: string }) => {
      setPill(next);
      if (next === "custom" && nextRange) {
        setCustomRange(nextRange);
      } else if (next !== "custom") {
        setCustomRange(undefined);
      }
    },
    [],
  );

  const totalPages = Math.max(1, Math.ceil(detailsTotal / pageSize));
  const isFirstLoad = stats === null && isLoading;

  // ---- Charts data --------------------------------------------------------

  // Stats efetivos para o gráfico de área (navegação tem prioridade).
  const activeChartStats = chartStats ?? stats;

  // pill="hoje" usa byHour (24 buckets) quando disponível.
  const isHourly = pill === "hoje" && activeChartStats?.byHour !== undefined;

  const areaData = useMemo<AreaChartData[]>(() => {
    if (isHourly) {
      // O navegador opera em escala diaria quando pill="hoje"; comparamos
      // se a data de referencia eh o dia atual em BRT para decidir se ha
      // horas "futuras" a esmaecer.
      const refIso = chartReferenceDate ?? todayIsoInBrt();
      const isToday = refIso.slice(0, 10) === todayIsoInBrt();
      return buildHourlyFullPeriod(activeChartStats, isToday);
    }
    if (navigatorPeriod) {
      return buildDailyFullPeriod(
        activeChartStats,
        effectiveChartRange.start,
        effectiveChartRange.end,
      );
    }
    // Pill nao navegavel ("tudo", "custom"): exibe linha continua do primeiro
    // dia com dado ate hoje (em BRT), nao apenas os dias com requisicoes
    // (evita 1 ponto solto quando so um dia teve atividade).
    if (!activeChartStats) return [];
    const byDay = activeChartStats.byDay;
    if (byDay.length === 0) return [];
    const map = new Map<string, number>();
    for (const d of byDay) map.set(d.day, d.costBrl);
    const firstIso = byDay[0].day;
    const todayIso = todayIsoInBrt();
    const startDate = isoLocalToDate(firstIso);
    const endDate = isoLocalToDate(todayIso);
    if (endDate < startDate) {
      return byDay.map((d) => ({
        name: dayLabelFmt.format(isoLocalToDate(d.day)),
        Custo: Number(d.costBrl.toFixed(6)),
      }));
    }
    const out: AreaChartData[] = [];
    let curIso = firstIso;
    const endIsoCmp = todayIso;
    while (curIso <= endIsoCmp) {
      out.push({
        name: dayLabelFmt.format(isoLocalToDate(curIso)),
        Custo: Number((map.get(curIso) ?? 0).toFixed(6)),
      });
      const [y, m, d] = curIso.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      curIso = dateIsoInBrt(next);
    }
    return out;
  }, [
    activeChartStats,
    isHourly,
    navigatorPeriod,
    chartReferenceDate,
    effectiveChartRange.start,
    effectiveChartRange.end,
  ]);

  const providerPieData = useMemo<PieChartData[]>(() => {
    if (!activeChartStats) return [];
    return activeChartStats.byProvider.map((p, i) => ({
      name: providerLabel(p.provider),
      value: Number(p.costBrl.toFixed(6)),
      color: getColorByIndex(i),
    }));
  }, [activeChartStats]);

  const modelBarData = useMemo<BarChartData[]>(() => {
    if (!activeChartStats) return [];
    return activeChartStats.byModel.slice(0, 12).map((m) => ({
      name: m.model,
      Custo: Number(m.costBrl.toFixed(6)),
    }));
  }, [activeChartStats]);

  // Mapa modelo → provider (alimenta o sub-rótulo "(Provider)" do BarChart).
  const providersByModel = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of activeChartStats?.byModel ?? []) {
      map[m.model] = providerLabel(m.provider);
    }
    return map;
  }, [activeChartStats]);

  // Opcoes do select global de modelo: respeita o provider global quando ha um;
  // caso contrario, lista todos os modelos do periodo agrupados, com sufixo
  // de provider para desambiguar. Cascade: trocar provider global zera o
  // modelo global (ver onChange do CustomSelect de provider abaixo).
  const globalModelOptions = useMemo<
    Array<{ value: string; label: string; provider?: string }>
  >(() => {
    if (globalProvider) {
      const list = modelsByProvider[globalProvider] ?? [];
      return list.map((m) => ({ value: m, label: m, provider: globalProvider }));
    }
    const flat: Array<{ value: string; label: string; provider?: string }> = [];
    for (const p of providers) {
      for (const m of modelsByProvider[p] ?? []) {
        flat.push({
          value: m,
          label: `${m} (${providerLabel(p)})`,
          provider: p,
        });
      }
    }
    return flat;
  }, [globalProvider, providers, modelsByProvider]);

  // KPIs e centro do donut sincronizam com o periodo navegado pelo grafico
  // (activeChartStats = chartStats ?? stats). Quando nao ha navegacao,
  // activeChartStats === stats e KPI exibe o periodo da pill.
  const totalCostBrlFormatted = useMemo(
    () => (activeChartStats ? formatBrl4(activeChartStats.totalCostBrl) : ","),
    [activeChartStats],
  );
  const chartTotalCostBrlFormatted = totalCostBrlFormatted;
  const custoSubtitle = useMemo(() => {
    if (!activeChartStats) return undefined;
    const base = `≈ ${formatUsd4(activeChartStats.totalCostUsd)}`;
    return activeChartStats.unknownCount > 0
      ? `${base} · ${numberFmt.format(activeChartStats.unknownCount)} sem preço`
      : base;
  }, [activeChartStats]);

  // ---- Render -------------------------------------------------------------

  // Range visível (mostrando X-Y de N). Quando há filtros, N é detailsTotal.
  const rangeStartIdx = detailsTotal === 0 ? 0 : page * pageSize + 1;
  const rangeEndIdx = Math.min((page + 1) * pageSize, detailsTotal);

  // Trocar de página recolhe a linha expandida (evita cursor stale).
  const handlePageChange = (next: number) => {
    setPage(next);
    setExpandedRowId(null);
  };

  const toggleExpanded = (id: string) =>
    setExpandedRowId((cur) => (cur === id ? null : id));

  const kpiCards = [
    {
      icon: MessageSquare,
      label: "Conversas",
      value: activeChartStats
        ? formatCompactCount(activeChartStats.totalConversations)
        : ",",
      subtitle: "threads distintos",
      tone: "default" as const,
    },
    {
      icon: Activity,
      label: "Chamadas",
      value: activeChartStats
        ? formatCompactCount(activeChartStats.totalIterations)
        : ",",
      subtitle: "no período",
      tone: "default" as const,
    },
    {
      icon: Hash,
      label: "Tokens entrada",
      value: activeChartStats
        ? formatTokens(activeChartStats.totalTokensInput)
        : ",",
      subtitle: "no período",
      tone: "default" as const,
    },
    {
      icon: Zap,
      label: "Tokens saída",
      value: activeChartStats
        ? formatTokens(activeChartStats.totalTokensOutput)
        : ",",
      subtitle: "no período",
      tone: "default" as const,
    },
    {
      icon: DollarSign,
      label: "Custo total",
      value: totalCostBrlFormatted,
      subtitle: custoSubtitle,
      tone:
        activeChartStats && activeChartStats.unknownCount > 0
          ? ("warning" as const)
          : ("default" as const),
    },
  ];

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Filtros , PeriodPills + filtro global de provider + ambiente */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPills
            value={pill}
            customRange={customRange}
            onChange={handlePeriodChange}
            minDate={minDate}
          />
          <CustomSelect
            value={ambiente}
            onChange={(v) => setAmbiente(v as Ambiente)}
            options={[
              { value: "all", label: "Todos os ambientes" },
              { value: "agente", label: "Agente Nex" },
              { value: "playground", label: "Playground" },
            ]}
            triggerClassName="min-h-[36px] h-9 w-[200px]"
            aria-label="Filtrar por ambiente (global)"
          />
          <CustomSelect
            value={globalProvider ?? "__all__"}
            onChange={(v) => {
              const next = v === "__all__" ? undefined : v;
              setGlobalProvider(next);
              // Provider mudou no global: zera o modelo global (cascade),
              // assim como o filtro local da tabela ja faz.
              if (next !== globalProvider) setGlobalModel(undefined);
            }}
            options={[
              { value: "__all__", label: "Todos os provedores" },
              ...providers.map((p) => ({
                value: p,
                label: providerLabel(p),
              })),
            ]}
            triggerClassName="min-h-[36px] h-9 w-[200px]"
            aria-label="Filtrar por provedor (global)"
          />
          <CustomSelect
            value={globalModel ?? "__all__"}
            onChange={(v) =>
              setGlobalModel(v === "__all__" ? undefined : v)
            }
            options={[
              { value: "__all__", label: "Todos os modelos" },
              ...globalModelOptions.map((m) => ({
                value: m.value,
                label: m.label,
              })),
            ]}
            triggerClassName="min-h-[36px] h-9 w-[220px]"
            aria-label="Filtrar por modelo (global)"
          />
        </div>
      </div>

      {/* Loading indicator renderizado via portal no `actions` slot do
          PageHeader (alinhado ao titulo "Consumo do Agente Nex"), evitando
          dividir espaco com a linha dos filtros. */}
      <HeaderActionsPortal>
        {isLoading ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Atualizando…
          </span>
        ) : null}
      </HeaderActionsPortal>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {/* KPI cards , 5 cartões */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06 } },
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {kpiCards.map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.25, ease: "easeOut" },
              },
            }}
          >
            <KpiCard
              icon={card.icon}
              label={card.label}
              value={card.value}
              subtitle={card.subtitle}
              tone={card.tone}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Charts grid , custo ocupa 2/3, distribuição 1/3 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border border-border bg-muted/30 lg:col-span-2">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-500" />
              {isHourly ? "Custo por hora" : "Custo por dia"}
              {isChartLoading ? (
                <Loader2
                  className="h-3 w-3 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </CardTitle>
            {navigatorPeriod ? (
              <PeriodNavigator
                period={navigatorPeriod}
                range={{
                  start: effectiveChartRange.start.toISOString(),
                  end: effectiveChartRange.end.toISOString(),
                }}
                tz={TZ}
                weekStartsOn={1}
                referenceDate={chartReferenceDate}
                nextAvailable={chartNextAvailable}
                onChange={setChartReferenceDate}
                minDate={minDate.toISOString()}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {isFirstLoad ? (
              <ChartSkeleton />
            ) : (
              <InteractiveAreaChart
                data={areaData}
                series={[
                  {
                    key: "Custo",
                    label: "Custo (R$)",
                    color: CHART_COLORS.violet,
                  },
                ]}
                height={300}
                formatValue={formatBrlRaw}
                yAxisCurrency="BRL"
                xAxisFontSize={isHourly ? 11 : 13}
                xAxisPadding={12}
                xAxisInterval={isHourly ? 1 : undefined}
                ariaLabel={
                  isHourly ? "Custo por hora em BRL" : "Custo diário em BRL"
                }
                emptyMessage="Sem custos no período"
                emptyHint="Tente ampliar o intervalo de datas."
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircuitBoard className="h-4 w-4 text-violet-500" />
              Distribuição por provedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFirstLoad ? (
              <ChartSkeleton />
            ) : (
              <DonutWithCenter
                data={providerPieData}
                centerLabel="Custo total"
                centerValue={chartTotalCostBrlFormatted}
                formatValue={formatBrl4}
                ariaLabel="Custo agrupado por provider em BRL"
                emptyMessage="Sem dados de provedor"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Custo por modelo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isFirstLoad ? (
            <ChartSkeleton height={320} />
          ) : (
            <InteractiveBarChart
              data={modelBarData}
              series={[
                {
                  key: "Custo",
                  label: "Custo (R$)",
                  color: CHART_COLORS.violet,
                },
              ]}
              height={320}
              layout={modelBarData.length > 6 ? "horizontal" : "vertical"}
              yAxisWidth={180}
              formatValue={formatBrlRaw}
              yAxisCurrency="BRL"
              xAxisFontSize={13}
              xAxisPadding={12}
              showLegend={false}
              providersByModel={providersByModel}
              ariaLabel="Custo agrupado por modelo em BRL"
              emptyMessage="Sem chamadas por modelo no período"
            />
          )}
        </CardContent>
      </Card>

      {/* Histórico de chamadas */}
      <Card className="rounded-2xl border border-border bg-muted/30">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-500" />
            Histórico de chamadas
            {drillLabel ? (
              <span
                role="status"
                aria-label={`Periodo filtrado pelo grafico: ${drillLabel}`}
                className="ml-2 inline-flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Periodo: {drillLabel}
                <button
                  type="button"
                  onClick={() => setChartReferenceDate(null)}
                  className="ml-1 cursor-pointer text-[11px] font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
                >
                  Limpar
                </button>
              </span>
            ) : null}
          </CardTitle>
          <UsageTableFilters
            providers={providers}
            modelsByProvider={modelsByProvider}
            selectedAmbiente={filterAmbiente}
            selectedProvider={filterProvider}
            selectedModel={filterModel}
            onAmbienteChange={(a) => setFilterAmbiente(a)}
            onProviderChange={(p) => setFilterProvider(p)}
            onModelChange={(m) => setFilterModel(m)}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead className="hidden md:table-cell">Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead
                    className="text-right"
                    title="Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio."
                  >
                    Tokens de entrada
                  </TableHead>
                  <TableHead
                    className="text-right"
                    title="Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio."
                  >
                    Tokens de saída
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Duração
                  </TableHead>
                  <TableHead className="text-right">Custo USD</TableHead>
                  <TableHead className="text-right">Custo BRL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha de TOTAL no topo */}
                {detailsTotals && detailsTotals.count > 0 ? (
                  <TableRow className="sticky top-0 z-[1] bg-violet-500/5 dark:bg-violet-500/10 border-b border-border/60 text-foreground font-bold text-sm">
                    <TableCell colSpan={5} className="whitespace-nowrap">
                      <span>Total no filtro</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(detailsTotals.tokensInput)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFmt.format(detailsTotals.tokensOutput)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums">
                      {formatDuration(detailsTotals.durationMsTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsdRaw(detailsTotals.costUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBrlRaw(detailsTotals.costBrl)}
                    </TableCell>
                  </TableRow>
                ) : null}

                {details.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {isLoading ? "Carregando…" : "Nenhuma chamada no período."}
                    </TableCell>
                  </TableRow>
                ) : (
                  details.flatMap((row) => {
                    const whisper = isWhisperModel(row.model);
                    const kind = row.requestKind || "texto";
                    const isExpanded = expandedRowId === row.id;
                    return [
                      <TableRow
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Detalhes da chamada de ${dateTimeFmt.format(new Date(row.createdAt))}`}
                        aria-expanded={isExpanded}
                        className={cn(
                          "group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/50",
                          isExpanded && "bg-violet-500/5",
                        )}
                        onClick={() => toggleExpanded(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpanded(row.id);
                          }
                        }}
                      >
                        <TableCell className="relative whitespace-nowrap tabular-nums pl-7">
                          <ChevronRight
                            className={cn(
                              "absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 transition-transform",
                              isExpanded
                                ? "rotate-90 opacity-80"
                                : "opacity-0 group-hover:opacity-60",
                            )}
                            aria-hidden="true"
                          />
                          {dateTimeFmt.format(new Date(row.createdAt))}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                              row.origin && ORIGIN_STYLES[row.origin]
                                ? ORIGIN_STYLES[row.origin]
                                : row.isPlayground
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                            )}
                          >
                            {row.origin && ORIGIN_LABELS[row.origin]
                              ? ORIGIN_LABELS[row.origin]
                              : row.isPlayground
                                ? "Playground"
                                : "Agente Nex"}
                          </span>
                        </TableCell>
                        <TableCell>{providerLabel(row.provider)}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs">
                          {row.model}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                              REQUEST_KIND_STYLES[kind] ??
                                REQUEST_KIND_STYLES.texto,
                            )}
                          >
                            {REQUEST_KIND_LABELS[kind] ?? "Texto"}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            whisper && "text-muted-foreground",
                          )}
                        >
                          {whisper ? "," : numberFmt.format(row.tokensInput)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            whisper && "text-muted-foreground",
                          )}
                        >
                          {whisper ? "," : numberFmt.format(row.tokensOutput)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                          {row.durationMs == null
                            ? ","
                            : formatDuration(row.durationMs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.costKnown ? (
                            formatUsdRaw(row.costUsd)
                          ) : (
                            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              preço desconhecido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {!row.costKnown ? (
                            <span className="text-muted-foreground">,</span>
                          ) : (
                            <span className="flex flex-col items-end gap-0.5">
                              <span>{formatBrlRaw(row.costBrl)}</span>
                              {row.rateStale ? (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400">
                                  cotação desatualizada
                                </span>
                              ) : null}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>,
                      isExpanded ? (
                        <TableRow
                          key={`${row.id}-expanded`}
                          className="bg-violet-500/[0.02] hover:bg-violet-500/[0.02]"
                        >
                          <TableCell colSpan={10} className="p-3">
                            <UsageDetailInline row={row} />
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação footer com 3 zonas */}
          {detailsTotal > 0 ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {numberFmt.format(rangeStartIdx)},
                {numberFmt.format(rangeEndIdx)} de{" "}
                {numberFmt.format(detailsTotal)}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={() => handlePageChange(Math.max(0, page - 1))}
                  disabled={page === 0 || isLoading}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Página {page + 1} de {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={() =>
                    handlePageChange(Math.min(totalPages - 1, page + 1))
                  }
                  disabled={page >= totalPages - 1 || isLoading}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="inline-flex items-center text-xs text-muted-foreground">
                <CustomSelect
                  value={String(pageSize)}
                  onChange={(v) => {
                    const next = Number(v) as PageSize;
                    if (PAGE_SIZE_OPTIONS.includes(next)) {
                      setPageSize(next);
                    }
                  }}
                  options={PAGE_SIZE_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `${n} por página`,
                  }))}
                  triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
                  aria-label="Itens por página"
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Drill-down inline (linha expansivel na propria tabela) substitui o
          drawer lateral. */}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

// Portal helper para colocar conteudo dentro do `actions` slot do PageHeader
// (alvo `#agente-consumo-header-actions`, declarado em page.tsx). Mounts ao
// se montar; descomeca a renderizar quando o target existe no DOM, evitando
// hydration mismatch.
function HeaderActionsPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("agente-consumo-header-actions"));
  }, []);
  if (!target) return null;
  return createPortal(children, target);
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando gráfico"
      className="w-full animate-pulse rounded-md bg-muted/40"
      style={{ height }}
    />
  );
}
