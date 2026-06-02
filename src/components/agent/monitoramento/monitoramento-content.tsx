"use client";

/**
 * MonitoramentoContent , orchestrator client da tela /agente/qualidade.
 *
 * Padrao copiado de consumo-content.tsx: filtros (periodo + modelo) no
 * topo, KPI cards, gráficos lado a lado e tabela paginada com drill-down
 * inline. Server actions com gate super_admin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { CustomSelect } from "@/components/ui/custom-select";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TZ,
  getPeriodInTz,
  type PeriodKey,
} from "@/lib/datetime-core";
import {
  fetchAllRodadaMarkers,
  fetchQualityDailyCorrectness,
  fetchQualityDistinctModels,
  fetchQualityDistinctRodadas,
  fetchQualityEvaluations,
  fetchQualityKpis,
  fetchQualityTopPatterns,
  type FilterInputs,
} from "@/lib/actions/quality-fetch";
import type {
  EvaluationRow,
  QualityKpisV2,
} from "@/lib/agent/quality/queries";
import {
  buildRodadaNamesFromMarkers,
  markerToRodadaName,
} from "@/lib/agent/quality/rodada-labels";
import {
  evaluatePendentesAction,
  countPendentes,
} from "@/lib/actions/quality-evaluate-pendentes";

import { ChartsBlock } from "./charts-block";
import { EvaluationsTable } from "./evaluations-table";
import { KpisBlock } from "./kpis-block";
import { AutoHeuristicConfig } from "./auto-heuristic-config";

const TZ = DEFAULT_TZ;

interface MonitoramentoContentProps {
  minDate: string;
  /** Intervalo (em minutos) atual da auditoria heuristica automatica.
   *  Lido do AgentSettings na page server-side, passado pro UI client. */
  qualityHeuristicIntervalMinutes: number;
  /** True quando o app roda localmente (dev). Habilita o botao de avaliar
   *  pendentes (LLM-judge), que so faz sentido na maquina local. */
  isLocalRuntime: boolean;
}

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}


function rangeForPills(
  pill: PeriodKey,
  customRange: { start: string; end: string } | undefined,
  minDate: Date,
): { start: Date; end: Date } {
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

export function MonitoramentoContent({
  minDate,
  qualityHeuristicIntervalMinutes,
  isLocalRuntime,
}: MonitoramentoContentProps) {
  const minDateObj = useMemo(() => new Date(minDate), [minDate]);

  const [pill, setPill] = useState<PeriodKey>("mes_atual");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>();
  const [model, setModel] = useState<string>("all");
  const [selectedRodadas, setSelectedRodadas] = useState<string[]>([]);

  const [models, setModels] = useState<string[]>([]);
  const [rodadas, setRodadas] = useState<Array<{ marker: string; count: number }>>([]);
  // Numeracao de rodadas (R8, R9, ...) baseada na ordem cronologica do
  // timestamp embutido no marker. CRITICO: o mapa e construido a partir de
  // TODOS os markers existentes (`allRodadaMarkers`, sem filtro de periodo),
  // nao dos markers do recorte atual. Caso contrario a rodada recente vira
  // "Rodada 8" nas views semana/mes (so ela cai no periodo) e R24 no "tudo".
  // Nenhuma rodada nova precisa de edicao manual em rodada-labels.ts.
  const [allRodadaMarkers, setAllRodadaMarkers] = useState<string[]>([]);
  const rodadaNameMap = useMemo(
    () => buildRodadaNamesFromMarkers(allRodadaMarkers),
    [allRodadaMarkers],
  );
  const labelFor = useCallback(
    (marker: string | null | undefined): string =>
      !marker ? "" : rodadaNameMap.get(marker) ?? markerToRodadaName(marker),
    [rodadaNameMap],
  );
  const [kpis, setKpis] = useState<QualityKpisV2 | null>(null);
  const [evaluations, setEvaluations] = useState<{
    rows: EvaluationRow[];
    total: number;
  } | null>(null);
  const [dailyData, setDailyData] = useState<
    Array<{ date: string; percent: number | null; total: number }>
  >([]);
  const [topPatterns, setTopPatterns] = useState<
    Array<{ pattern: string; count: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);

  const period = useMemo(
    () => rangeForPills(pill, customRange, minDateObj),
    [pill, customRange, minDateObj],
  );

  const baseFilters = useMemo<FilterInputs>(
    () => ({
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      models: model === "all" ? undefined : [model],
      rodadas: selectedRodadas.length > 0 ? selectedRodadas : undefined,
    }),
    [period, model, selectedRodadas],
  );

  // Range completo do periodo (sem filtro de rodada) para popular o
  // dropdown de rodadas com todas as opcoes disponiveis no periodo.
  const rangeFilters = useMemo<FilterInputs>(
    () => ({
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
    }),
    [period],
  );

  // Carrega modelos disponíveis uma vez.
  useEffect(() => {
    void fetchQualityDistinctModels()
      .then(setModels)
      .catch((err) => {
        console.error("[Qualidade] falha ao carregar modelos:", err);
      });
  }, []);

  // Carrega TODOS os markers de rodada uma vez (sem filtro de periodo) para
  // a numeracao global das rodadas ficar estavel entre as views.
  useEffect(() => {
    void fetchAllRodadaMarkers()
      .then(setAllRodadaMarkers)
      .catch((err) => {
        console.error("[Qualidade] falha ao carregar markers de rodada:", err);
      });
  }, []);

  // Carrega rodadas disponiveis quando o periodo muda. NAO depende do
  // filtro de rodada atual (queremos mostrar todas as rodadas do periodo
  // mesmo quando uma esta selecionada). Quando a selecao atual deixa de
  // existir nas opcoes, reseta pra "all".
  useEffect(() => {
    void fetchQualityDistinctRodadas(rangeFilters)
      .then((list) => {
        setRodadas(list);
        // Tira da selecao as rodadas que sumiram do periodo.
        setSelectedRodadas((prev) =>
          prev.filter((r) => list.some((opt) => opt.marker === r)),
        );
      })
      .catch((err) => {
        console.error("[Qualidade] falha ao carregar rodadas:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeFilters.periodStart, rangeFilters.periodEnd]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [k, ev, daily, patterns] = await Promise.all([
        fetchQualityKpis(baseFilters),
        fetchQualityEvaluations(baseFilters, { page: 1, pageSize: 50 }),
        fetchQualityDailyCorrectness(baseFilters),
        fetchQualityTopPatterns(baseFilters),
      ]);
      setKpis(k);
      setEvaluations(ev);
      setDailyData(daily);
      setTopPatterns(patterns);
    } catch (err) {
      console.error("[Qualidade] falha ao carregar dados:", err);
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [baseFilters]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const availablePatterns = useMemo(
    () => topPatterns.map((p) => p.pattern).sort(),
    [topPatterns],
  );

  // Avaliar pendentes (LLM-judge) , so em runtime local. Dispara o script no
  // dev server e faz polling da contagem de pendentes ate estabilizar; ao
  // terminar, recarrega os dados da tela.
  const [evaluating, setEvaluating] = useState(false);
  const handleEvaluatePendentes = useCallback(async () => {
    setEvaluating(true);
    try {
      const res = await evaluatePendentesAction();
      if (!res.started) {
        toast.info(
          res.reason ?? (res.pendentes === 0 ? "Não há pendentes." : "Não iniciou."),
        );
        setEvaluating(false);
        return;
      }
      toast.success(`Avaliando ${res.pendentes} pendentes via LLM-judge…`);
      // Polling: a cada 4s, conta pendentes; encerra quando chega a 0 ou para
      // de cair por 3 leituras seguidas (timeout defensivo ~5min).
      let stable = 0;
      let last = res.pendentes;
      for (let i = 0; i < 75; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const n = await countPendentes().catch(() => last);
        if (n === 0) break;
        if (n >= last) {
          stable++;
          if (stable >= 3) break;
        } else {
          stable = 0;
        }
        last = n;
      }
      await reload();
      toast.success("Avaliação concluída.");
    } catch (err) {
      console.error("[Qualidade] falha ao avaliar pendentes:", err);
      toast.error("Falha ao avaliar pendentes.");
    } finally {
      setEvaluating(false);
    }
  }, [reload]);

  return (
    <div className="space-y-5">
      {/* Filtros de topo: periodo + modelo. Card removido para deixar o
          bloco mais leve (estava muito grosso); fica como uma faixa
          flat com flex. */}
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPills
          value={pill}
          customRange={customRange}
          onChange={(next, range) => {
            setPill(next);
            setCustomRange(range);
          }}
          minDate={minDateObj}
        />
        {isLocalRuntime && (
          <button
            type="button"
            onClick={handleEvaluatePendentes}
            disabled={evaluating || (kpis?.pendentes ?? 0) === 0}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            title="Avalia as avaliações pendentes via LLM-judge (só no ambiente local)"
          >
            {evaluating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {evaluating
              ? "Avaliando…"
              : `Avaliar pendentes${kpis?.pendentes ? ` (${kpis.pendentes})` : ""}`}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <CustomSelect
            value={model}
            onChange={setModel}
            triggerClassName="min-h-[36px] h-9 min-w-[180px]"
            aria-label="Modelo do agente"
            options={[
              { value: "all", label: "Todos os modelos" },
              ...models.map((m) => ({ value: m, label: m })),
            ]}
          />
          <RodadaMultiSelect
            options={rodadas}
            selected={selectedRodadas}
            labelFor={labelFor}
            onToggle={(marker) =>
              setSelectedRodadas((prev) =>
                prev.includes(marker)
                  ? prev.filter((x) => x !== marker)
                  : [...prev, marker],
              )
            }
            onClear={() => setSelectedRodadas([])}
          />
        </div>
      </div>

      {/* KPIs */}
      {kpis ? (
        <KpisBlock kpis={kpis} loading={loading} />
      ) : (
        <KpisBlock
          kpis={{
            totalAvaliado: 0,
            corretos: 0,
            parciais: 0,
            errados: 0,
            foraDoEscopo: 0,
            pendentes: 0,
            falhasTecnicas: 0,
            percentCorreto: null,
          }}
          loading={firstLoad}
        />
      )}

      {/* Charts */}
      {kpis && (
        <ChartsBlock
          dailyData={dailyData}
          kpis={kpis}
          topPatterns={topPatterns}
          loading={loading}
        />
      )}

      {/* Tabela paginada com filtros sticky e drill-down */}
      {evaluations && (
        <EvaluationsTable
          initialData={evaluations}
          baseFilters={baseFilters}
          availableModels={models}
          availablePatterns={availablePatterns}
          labelForRodada={labelFor}
        />
      )}

      {/* Configuracao da auditoria heuristica automatica (cron BullMQ). */}
      <AutoHeuristicConfig initialMinutes={qualityHeuristicIntervalMinutes} />
    </div>
  );
}

/** Multi-select de rodadas com checkboxes + Badge (igual ao StatusMultiSelect). */
function RodadaMultiSelect({
  options,
  selected,
  labelFor,
  onToggle,
  onClear,
}: {
  options: Array<{ marker: string; count: number }>;
  selected: string[];
  labelFor: (marker: string | null | undefined) => string;
  onToggle: (marker: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);
  const triggerLabel =
    selected.length === 0
      ? "Todas as origens"
      : selected.length === 1
        ? labelFor(selected[0])
        : `${selected.length} origens`;

  if (!mounted) {
    return (
      <div
        className="flex h-9 w-[180px] items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground"
        aria-hidden
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-label="Filtrar por origem"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
        align="end"
        sideOffset={4}
        className="w-[200px] overflow-hidden p-1"
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Sem origens no período.
          </div>
        ) : (
          // Lista limitada a ~12 itens visíveis (rolagem interna), evita
          // crescer indefinidamente quando acumula rodadas e origens novas.
          // 12 * ~32px (itens) + 4px (padding) ≈ 388px de altura útil.
          <ul
            role="listbox"
            aria-label="Origem"
            className="flex max-h-[388px] flex-col overflow-y-auto"
          >
            {options.map((opt) => {
              const isOn = selected.includes(opt.marker);
              return (
                <li key={opt.marker} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => onToggle(opt.marker)}
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
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {labelFor(opt.marker)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {opt.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
