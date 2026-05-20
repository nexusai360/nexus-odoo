"use client";

/**
 * ConsumoContent — Componente cliente raiz da tela /agente/consumo.
 *
 * Orquestra: filtros de período + provider + ambiente, KPIs, gráficos, tabela.
 * Portado de nexus-insights/src/components/llm/consumo-content.tsx com as
 * correções dos 8 BUGs da SPEC §4.6.
 *
 * Task 5.2a: KPIs + estrutura da página.
 * Task 5.2b: gráficos (usage-charts.tsx) — montados abaixo após commit 5.2a.
 * Task 5.2c: tabela, filtros e drill-down.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarRange, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { KpiRow, type KpiRowData } from "./kpi-row";
import { UsageCharts } from "./usage-charts";
import { UsageTable } from "./usage-table";
import { DateRangePopover } from "./date-range-popover";
import {
  fetchUsageStats,
  fetchDistinctProviders,
  fetchDistinctModels,
} from "@/lib/actions/llm-usage";
import type { UsageSummaryV2 } from "@/lib/agent/llm/usage-stats";

// ---------------------------------------------------------------------------
// Constantes e tipos
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

type PeriodKey = "hoje" | "semana_atual" | "mes_atual" | "todos" | "custom";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  semana_atual: "Esta semana",
  mes_atual: "Este mês",
  todos: "Tudo",
  custom: "Personalizado",
};

// ---------------------------------------------------------------------------
// Helpers de período
// ---------------------------------------------------------------------------

function getPeriodRange(pill: PeriodKey, customRange: { start: string; end: string } | undefined, minDate: Date): { start: Date; end: Date } {
  const now = new Date();

  if (pill === "todos") return { start: minDate, end: now };

  if (pill === "custom" && customRange) {
    const [sy, sm, sd] = customRange.start.split("-").map(Number);
    const [ey, em, ed] = customRange.end.split("-").map(Number);
    const start = new Date(sy, (sm ?? 1) - 1, sd ?? 1, 0, 0, 0, 0);
    const end = new Date(ey, (em ?? 1) - 1, (ed ?? 1) + 1, 0, 0, 0, -1);
    return { start, end };
  }

  // Calcular usando Intl para BRT
  const nowBrt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const [y, m, d] = nowBrt.split("-").map(Number);

  if (pill === "hoje") {
    const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    const end = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1, 0, 0, 0, -1);
    return { start, end };
  }

  if (pill === "semana_atual") {
    const today = new Date(y, (m ?? 1) - 1, d ?? 1);
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    sunday.setMilliseconds(-1);
    return { start: monday, end: sunday };
  }

  if (pill === "mes_atual") {
    const start = new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m ?? 1, 1, 0, 0, 0, -1);
    return { start, end };
  }

  return { start: minDate, end: now };
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR");

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface ConsumoContentProps {
  minDate: string;
}

export function ConsumoContent({ minDate: minDateIso }: ConsumoContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const minDate = useMemo(() => new Date(minDateIso), [minDateIso]);

  // Filtros
  const [pill, setPill] = useState<PeriodKey>("mes_atual");
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | undefined>();
  const [globalProvider, setGlobalProvider] = useState<string | undefined>();
  const [ambiente, setAmbiente] = useState<"all" | "agente" | "playground">("all");
  const [providers, setProviders] = useState<string[]>([]);

  // Dados
  const [stats, setStats] = useState<UsageSummaryV2 | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => getPeriodRange(pill, customRange, minDate),
    [pill, customRange, minDate],
  );

  const isPlaygroundFilter: boolean | null =
    ambiente === "all" ? null : ambiente === "playground";

  // Fetch de stats
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsLoading(true);

    const run = async () => {
      try {
        const s = await fetchUsageStats({
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          provider: globalProvider ?? null,
          isPlayground: isPlaygroundFilter,
        });
        if (!cancelled) setStats(s);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), globalProvider, isPlaygroundFilter]);

  // Fetch de providers (filtros cascade)
  useEffect(() => {
    let cancelled = false;
    fetchDistinctProviders({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    })
      .then((list) => { if (!cancelled) setProviders(list); })
      .catch(() => { if (!cancelled) setProviders([]); });
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  const handlePillChange = useCallback((next: PeriodKey) => {
    setPill(next);
    if (next !== "custom") setCustomRange(undefined);
  }, []);

  const kpiData: KpiRowData | null = stats
    ? {
        totalConversations: stats.totalConversations,
        totalIterations: stats.totalIterations,
        totalTokensInput: stats.totalTokensInput,
        totalTokensOutput: stats.totalTokensOutput,
        totalCostUsd: stats.totalCostUsd,
        totalCostBrl: stats.totalCostBrl,
        unknownCount: stats.unknownCount,
      }
    : null;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Filtros de período + provider + ambiente */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Pills de período */}
        <div className="flex flex-wrap items-center gap-2">
          {(["hoje", "semana_atual", "mes_atual", "todos"] as PeriodKey[]).map(
            (key) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePillChange(key)}
                className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  pill === key
                    ? "border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                    : "border-border bg-background text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[key]}
              </button>
            ),
          )}

          {/* Pill "Personalizado" — abre o seletor de intervalo */}
          <DateRangePopover
            value={customRange}
            minDate={minDateIso.slice(0, 10)}
            onApply={(start, end) => {
              setCustomRange({ start, end });
              setPill("custom");
            }}
          >
            <button
              type="button"
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                pill === "custom"
                  ? "border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  : "border-border bg-background text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              {pill === "custom" && customRange
                ? `${customRange.start.split("-").reverse().slice(0, 2).join("/")} – ${customRange.end.split("-").reverse().slice(0, 2).join("/")}`
                : "Personalizado"}
            </button>
          </DateRangePopover>

          {/* Filtro de provedor */}
          {providers.length > 0 && (
            <CustomSelect
              aria-label="Filtrar por provedor"
              value={globalProvider ?? "__all__"}
              onChange={(v) =>
                setGlobalProvider(v === "__all__" ? undefined : v)
              }
              triggerClassName="h-9 min-w-[180px]"
              options={[
                { value: "__all__", label: "Todos os provedores" },
                ...providers.map((p) => ({
                  value: p,
                  label: p.charAt(0).toUpperCase() + p.slice(1),
                })),
              ]}
            />
          )}

          {/* Filtro de ambiente */}
          <CustomSelect
            aria-label="Filtrar por ambiente"
            value={ambiente}
            onChange={(v) =>
              setAmbiente(v as "all" | "agente" | "playground")
            }
            triggerClassName="h-9 min-w-[180px]"
            options={[
              { value: "all", label: "Todos os ambientes" },
              { value: "agente", label: "Agente Nex" },
              { value: "playground", label: "Playground" },
            ]}
          />
        </div>

        {isLoading && (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Atualizando…
          </span>
        )}
      </div>

      {/* Erro */}
      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {/* KPI Row — 6 cartões: conversas, iterações, tokens entrada/saída, custo USD/BRL */}
      <KpiRow data={kpiData} isLoading={isLoading && stats === null} />

      {/* Gráficos — Task 5.2b */}
      <UsageCharts
        stats={stats}
        isLoading={isLoading && stats === null}
        isHourly={pill === "hoje" && !!stats?.byHour}
      />
      {/* Tabela paginada com filtros e drill-down — Task 5.2c */}
      <UsageTable
        rangeStart={range.start.toISOString()}
        rangeEnd={range.end.toISOString()}
        globalProvider={globalProvider}
        isPlayground={isPlaygroundFilter}
        providers={providers}
        modelsByProvider={{}}
        onFetchModels={async (p, start, end) => fetchDistinctModels({ start, end, provider: p ?? null })}
      />
    </motion.div>
  );
}

// Re-export para uso em subcomponentes
export type { PeriodKey };
export { numberFmt, TZ, getPeriodRange };
