"use client";

/**
 * QualidadeContent , orchestrator client da tela /agente/qualidade.
 *
 * Padrao copiado de consumo-content.tsx: filtros (periodo + modelo) no
 * topo, KPI cards, gráficos lado a lado e tabela paginada com drill-down
 * inline. Server actions com gate super_admin.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomSelect } from "@/components/ui/custom-select";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  DEFAULT_TZ,
  getPeriodInTz,
  type PeriodKey,
} from "@/lib/datetime-core";
import {
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

import { ChartsBlock } from "./charts-block";
import { EvaluationsTable } from "./evaluations-table";
import { KpisBlock } from "./kpis-block";

const TZ = DEFAULT_TZ;

interface QualidadeContentProps {
  minDate: string;
}

function isoLocalToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Converte marker tipo "[AUDIT-POS-2026-05-26T03-43-05]" em "26/05 03:43" */
function formatRodadaLabel(marker: string): string {
  const m = marker.match(
    /\[AUDIT-(?:[A-Z]+-)?(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/,
  );
  if (!m) return marker;
  const [, , month, day, hour, min] = m;
  return `${day}/${month} ${hour}:${min}`;
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

export function QualidadeContent({ minDate }: QualidadeContentProps) {
  const minDateObj = useMemo(() => new Date(minDate), [minDate]);

  const [pill, setPill] = useState<PeriodKey>("mes_atual");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>();
  const [model, setModel] = useState<string>("all");
  const [rodada, setRodada] = useState<string>("all");

  const [models, setModels] = useState<string[]>([]);
  const [rodadas, setRodadas] = useState<Array<{ marker: string; count: number }>>([]);
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
      rodadas: rodada === "all" ? undefined : [rodada],
    }),
    [period, model, rodada],
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

  // Carrega rodadas disponiveis quando o periodo muda. NAO depende do
  // filtro de rodada atual (queremos mostrar todas as rodadas do periodo
  // mesmo quando uma esta selecionada). Quando a selecao atual deixa de
  // existir nas opcoes, reseta pra "all".
  useEffect(() => {
    void fetchQualityDistinctRodadas(rangeFilters)
      .then((list) => {
        setRodadas(list);
        if (rodada !== "all" && !list.some((r) => r.marker === rodada)) {
          setRodada("all");
        }
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
        fetchQualityEvaluations(baseFilters, { page: 1, pageSize: 25 }),
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
          <CustomSelect
            value={rodada}
            onChange={setRodada}
            triggerClassName="min-h-[36px] h-9 min-w-[220px]"
            aria-label="Rodada (batch de auditoria)"
            options={[
              { value: "all", label: "Todas as rodadas" },
              ...rodadas.map((r) => ({
                value: r.marker,
                label: `${formatRodadaLabel(r.marker)} · ${r.count}`,
              })),
            ]}
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
        />
      )}
    </div>
  );
}
