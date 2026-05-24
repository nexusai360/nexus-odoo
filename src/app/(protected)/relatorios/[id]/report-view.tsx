"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, TrendingDown, DollarSign, Warehouse, Clock, TrendingUp, Package, Keyboard, HelpCircle } from "lucide-react";
import type { ReportEntry, ReportSection, ReportState } from "@/lib/reports/types";
import { ReportFilters } from "@/components/reports/report-filters";
import type { FilterOptions } from "@/components/reports/report-filters";
import { PresetsPopover } from "@/components/reports/presets-popover";
import { KPICard } from "@/components/charts/kpi-card";
import { ChartCard } from "@/components/charts/chart-card";
import { FreshnessIndicator } from "@/components/charts/freshness-indicator";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { BarChartCard } from "@/components/charts/bar-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { PeriodBar } from "@/components/reports/period-bar";
import { resolveReportIcon } from "@/lib/reports/report-icons";
import type { PeriodoResolvido } from "@/lib/reports/periodo";
import type { SaldoProdutoData, SaldoProdutoRow, ValorArmazemData, EntradasSaidasData, ProdutoParadoData, TopMovimentadoData } from "@/lib/actions/report-data";
import { SaldoProdutoDrillDown } from "@/components/charts/saldo-produto-drill-down";
import { AppliedFiltersChips } from "@/components/reports/applied-filters-chips";
import { buildChipsFromParams } from "@/lib/reports/build-chips";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { KeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";
import { useTourState } from "@/hooks/use-tour-state";
import { ShortcutsHelpDialog } from "@/components/reports/shortcuts-help-dialog";
import { ReportTour } from "@/components/reports/report-tour";
import type { TourStep } from "@/components/reports/report-tour";
import { Button } from "@/components/ui/button";

/** Uma seção já resolvida com seu estado e dados. */
export interface SecaoComDados {
  secao: ReportSection;
  estado: ReportState;
  dados: unknown;
}

interface ReportViewProps {
  report: ReportEntry;
  secoes: SecaoComDados[];
  freshness: Date | null;
  options: FilterOptions;
  /** Período resolvido , `null` em relatórios sem dimensão temporal. */
  periodo: PeriodoResolvido | null;
  /** Mês mais antigo com dado ("YYYY-MM") , limita o calendário personalizado. */
  periodoMin: string | null;
}

function renderSecao(
  { secao, estado, dados }: SecaoComDados,
  report: ReportEntry,
  onRetry: () => void,
) {
  const cfg = secao.config;
  switch (secao.template) {
    case "KPICard": {
      const d = dados as { total?: number };
      // KPICard já é um cartão , não recebe wrapper ChartCard.
      return (
        <KPICard
          valor={d?.total ?? 0}
          rotulo={String(cfg.rotulo ?? "")}
          formato="inteiro"
          estado={estado}
          icone={resolveReportIcon(report.icone)}
        />
      );
    }
    case "KPIRow": {
      const variante = String(cfg.variante ?? "");

      if (variante === "valor-armazem") {
        const d = dados as ValorArmazemData | null | undefined;
        const kpis = d?.kpis;
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KPICard
              valor={kpis?.valorTotal ?? 0}
              rotulo="Valor total do estoque"
              formato="moeda"
              estado={estado}
              icone={DollarSign}
              onRetry={onRetry}
            />
            <KPICard
              valor={kpis?.numArmazens ?? 0}
              rotulo="Armazéns com estoque"
              formato="inteiro"
              estado={estado}
              icone={Warehouse}
              onRetry={onRetry}
            />
          </div>
        );
      }

      if (variante === "top-movimentados") {
        const d = dados as TopMovimentadoData | null | undefined;
        const kpis = d?.kpis;
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KPICard
              valor={kpis?.totalProdutos ?? 0}
              rotulo="Produtos movimentados"
              formato="inteiro"
              estado={estado}
              icone={Package}
              onRetry={onRetry}
            />
            <KPICard
              valor={kpis?.totalUnidades ?? 0}
              rotulo="Total de unidades movimentadas"
              formato="inteiro"
              estado={estado}
              icone={TrendingUp}
              onRetry={onRetry}
            />
          </div>
        );
      }

      if (variante === "produtos-parados") {
        const d = dados as ProdutoParadoData | null | undefined;
        const kpis = d?.kpis;
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KPICard
              valor={kpis?.totalParados ?? 0}
              rotulo="Produtos parados"
              formato="inteiro"
              estado={estado}
              icone={Clock}
              tone="danger"
              onRetry={onRetry}
            />
            <KPICard
              valor={kpis?.valorImobilizado ?? 0}
              rotulo="Valor imobilizado"
              formato="moeda"
              estado={estado}
              icone={DollarSign}
              onRetry={onRetry}
            />
          </div>
        );
      }

      // Variante padrão: saldo-produto (3 KPIs).
      const d = dados as SaldoProdutoData | null | undefined;
      const kpis = d?.kpis;
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KPICard
            valor={kpis?.totalProdutos ?? 0}
            rotulo="Produtos"
            formato="inteiro"
            estado={estado}
            icone={Boxes}
            onRetry={onRetry}
          />
          <KPICard
            valor={kpis?.produtosNegativos ?? 0}
            rotulo="Com saldo negativo"
            formato="inteiro"
            estado={estado}
            icone={TrendingDown}
            tone="danger"
            onRetry={onRetry}
          />
          <KPICard
            valor={kpis?.valorTotal ?? 0}
            rotulo="Valor total do estoque"
            formato="moeda"
            estado={estado}
            icone={DollarSign}
            onRetry={onRetry}
          />
        </div>
      );
    }
    case "DataTable": {
      const d = dados as SaldoProdutoData | { linhas?: unknown[] } | unknown[] | null | undefined;
      const linhas = Array.isArray(d)
        ? d
        : (d != null && typeof d === "object" && "linhas" in d
            ? (d as { linhas?: unknown[] }).linhas
            : d != null && typeof d === "object"
              ? (pickFatia(d, secao.id) as unknown[])
              : undefined) ?? [];

      // expandDetail para o relatório saldo-produto: drill-down por local.
      const isSaldoProduto =
        report.id === "saldo-produto" &&
        d != null &&
        typeof d === "object" &&
        "linhas" in d;

      const expandDetail = isSaldoProduto
        ? (row: Record<string, unknown>) => {
            const r = row as unknown as SaldoProdutoRow;
            if (!r.detalhePorLocal || r.detalhePorLocal.length === 0) return null;
            return (
              <SaldoProdutoDrillDown
                detalhes={r.detalhePorLocal}
                produtoNome={r.produtoNome}
              />
            );
          }
        : undefined;

      return (
        <ChartCard>
          <DataTable
            columns={cfg.colunas as ColumnDef<Record<string, unknown>>[]}
            rows={linhas as Record<string, unknown>[]}
            estado={estado}
            searchable={Boolean(cfg.searchable)}
            onRetry={onRetry}
            expandDetail={expandDetail}
            exportFilename={report.id}
          />
        </ChartCard>
      );
    }
    case "BarChart": {
      // Discrimina a fatia de dados multi-fato pelo id da seção, não pela
      // presença de uma chave (IM-05).
      const data = pickFatia(dados, secao.id);
      return (
        <ChartCard>
          <BarChartCard
            data={data}
            config={cfg as never}
            estado={estado}
            onRetry={onRetry}
          />
        </ChartCard>
      );
    }
    case "LineChart": {
      // R3 devolve { serie, detalhe } , extraímos apenas a fatia do gráfico.
      const lineData = Array.isArray(dados)
        ? (dados as unknown as Record<string, unknown>[])
        : (() => {
            const d = dados as EntradasSaidasData | null | undefined;
            return (d?.serie ?? []) as unknown as Record<string, unknown>[];
          })();
      return (
        <ChartCard>
          <LineChartCard
            data={lineData}
            config={cfg as never}
            estado={estado}
            onRetry={onRetry}
          />
        </ChartCard>
      );
    }
    case "PieChart": {
      const data = pickFatia(dados, secao.id);
      return (
        <ChartCard>
          <PieChartCard
            data={data}
            config={cfg as never}
            estado={estado}
            onRetry={onRetry}
          />
        </ChartCard>
      );
    }
    default:
      return null;
  }
}

/**
 * Extrai a fatia de dados de uma seção. Quando `dados` é um array, usa-o
 * direto; quando é um objeto multi-fato (R6), seleciona a propriedade
 * homônima ao id da seção (`familia`/`marca`) , discriminação explícita,
 * não por inspeção de chave (IM-05).
 */
function pickFatia(dados: unknown, secaoId: string): Record<string, unknown>[] {
  if (Array.isArray(dados)) return dados as Record<string, unknown>[];
  if (dados && typeof dados === "object") {
    const fatia = (dados as Record<string, unknown>)[secaoId];
    if (Array.isArray(fatia)) return fatia as Record<string, unknown>[];
  }
  return [];
}

// ─── Passos do tour global de relatórios ──────────────────────────────────────
const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='period-bar']",
    title: "Período",
    description:
      "Selecione o intervalo de tempo dos dados. Você pode escolher meses pré-definidos ou configurar um período personalizado.",
  },
  {
    target: "[data-tour='report-filters']",
    title: "Filtros",
    description:
      "Filtre os dados por armazém, família de produto, sentido de movimentação e outras dimensões disponíveis no relatório.",
  },
  {
    target: "[data-tour='presets-btn']",
    title: "Presets",
    description:
      "Salve combinações de filtros que você usa com frequência. Acesse rapidamente com um clique , ou use a tecla P.",
  },
  {
    target: "[data-tour='data-table']",
    title: "Tabela de dados",
    description:
      "Explore os dados em detalhe. Use o campo de busca para filtrar linhas (atalho /) e clique nas linhas para expandir detalhes.",
  },
  {
    target: "[data-tour='export-btn']",
    title: "Exportar",
    description:
      "Exporte os dados da tabela em CSV para análise externa. O arquivo incluirá todos os registros filtrados.",
  },
];

/** Renderiza um relatório: filtros, seções em sequência e freshness. */
export function ReportView({
  report, secoes, freshness, options, periodo, periodoMin,
}: ReportViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { active: tourActive, onClose: onTourClose, openTour } = useTourState(
    `relatorio:${report.id}`,
  );

  // Várias seções podem declarar o mesmo filtro (ex.: armazém na seção de KPIs
  // e na de tabela). A barra de filtros renderiza um controle por tipo , então
  // deduplicamos por `tipo` para não gerar chaves React repetidas nem
  // controles duplicados na tela.
  const todosFiltros = report.secoes
    .flatMap((s) => s.filtros)
    .filter((f, i, arr) => arr.findIndex((x) => x.tipo === f.tipo) === i);

  // Chips de filtros aplicados , derivados dos searchParams atuais.
  const chips = useMemo(
    () => buildChipsFromParams(searchParams, options),
    [searchParams, options],
  );

  // Re-busca o relatório no servidor: refaz as queries de seção e
  // re-renderiza com os dados frescos sem recarregar a página inteira.
  const onRetry = () => router.refresh();

  // Foca o input de busca da tabela (primeiro input com data-table-search)
  const focusSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      "[data-table-search]",
    );
    input?.focus();
  }, []);

  // Atalhos registrados nesta tela
  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: "/",
        action: focusSearch,
        description: "Focar busca da tabela",
      },
      {
        key: "f",
        action: () => setFiltersOpen(true),
        description: "Abrir filtros",
      },
      {
        key: "p",
        action: () => setPresetsOpen(true),
        description: "Abrir presets",
      },
      {
        key: "?",
        action: () => setShortcutsOpen(true),
        description: "Abrir ajuda de atalhos",
        modifiers: { shift: true },
      },
    ],
    [focusSearch],
  );

  useKeyboardShortcuts(shortcuts, { enabled: !shortcutsOpen });

  return (
    <>
      <div className="flex flex-col gap-6">
        {periodo ? (
          <div data-tour="period-bar">
            <PeriodBar periodo={periodo} mesMin={periodoMin} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2" data-tour="report-filters">
          <div className="flex-1">
            <ReportFilters
              filtros={todosFiltros}
              options={options}
              externalOpen={filtersOpen}
              onExternalOpenChange={setFiltersOpen}
            />
          </div>
          <div data-tour="presets-btn">
            <PresetsPopover
              reportId={report.id}
              externalOpen={presetsOpen}
              onExternalOpenChange={setPresetsOpen}
            />
          </div>
          {/* Botão de atalhos */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado (?)"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="size-3.5" aria-hidden />
          </Button>
          {/* Botão de tour */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={openTour}
            aria-label="Iniciar tour de onboarding"
            title="Tour guiado"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="size-3.5" aria-hidden />
          </Button>
        </div>
        <AppliedFiltersChips chips={chips} />
        <div data-tour="data-table">
          {secoes.map((sd) => (
            <div key={sd.secao.id} className="mb-6 last:mb-0">
              {renderSecao(sd, report, onRetry)}
            </div>
          ))}
        </div>
        <FreshnessIndicator freshness={freshness} />
      </div>

      <ShortcutsHelpDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={shortcuts}
      />

      <ReportTour
        steps={TOUR_STEPS}
        active={tourActive}
        onClose={onTourClose}
      />
      {/* Ref para input de busca , preenchido pelo DataTable via callback */}
      <span ref={searchInputRef} aria-hidden className="sr-only" />
    </>
  );
}
