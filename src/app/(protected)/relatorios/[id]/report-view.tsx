"use client";

import { useRouter } from "next/navigation";
import { Boxes, TrendingDown, DollarSign } from "lucide-react";
import type { ReportEntry, ReportSection, ReportState } from "@/lib/reports/types";
import { ReportFilters } from "@/components/reports/report-filters";
import type { FilterOptions } from "@/components/reports/report-filters";
import { KPICard } from "@/components/charts/kpi-card";
import { ChartCard } from "@/components/charts/chart-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { BarChartCard } from "@/components/charts/bar-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { PeriodBar } from "@/components/reports/period-bar";
import { resolveReportIcon } from "@/lib/reports/report-icons";
import type { PeriodoResolvido } from "@/lib/reports/periodo";
import type { SaldoProdutoData } from "@/lib/actions/report-data";

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
  /** Período resolvido — `null` em relatórios sem dimensão temporal. */
  periodo: PeriodoResolvido | null;
  /** Mês mais antigo com dado ("YYYY-MM") — limita o calendário personalizado. */
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
      // KPICard já é um cartão — não recebe wrapper ChartCard.
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
      // Row de 3 KPI cards para o relatório saldo-produto.
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
            : undefined) ?? [];
      return (
        <ChartCard>
          <DataTable
            columns={cfg.colunas as ColumnDef<Record<string, unknown>>[]}
            rows={linhas as Record<string, unknown>[]}
            estado={estado}
            searchable={Boolean(cfg.searchable)}
            onRetry={onRetry}
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
    case "LineChart":
      return (
        <ChartCard>
          <LineChartCard
            data={dados as Record<string, unknown>[]}
            config={cfg as never}
            estado={estado}
            onRetry={onRetry}
          />
        </ChartCard>
      );
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
 * homônima ao id da seção (`familia`/`marca`) — discriminação explícita,
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

/** Renderiza um relatório: filtros, seções em sequência e freshness. */
export function ReportView({
  report, secoes, freshness, options, periodo, periodoMin,
}: ReportViewProps) {
  const router = useRouter();
  // Várias seções podem declarar o mesmo filtro (ex.: armazém na seção de KPIs
  // e na de tabela). A barra de filtros renderiza um controle por tipo — então
  // deduplicamos por `tipo` para não gerar chaves React repetidas nem
  // controles duplicados na tela.
  const todosFiltros = report.secoes
    .flatMap((s) => s.filtros)
    .filter((f, i, arr) => arr.findIndex((x) => x.tipo === f.tipo) === i);
  // Re-busca o relatório no servidor: refaz as queries de seção e
  // re-renderiza com os dados frescos sem recarregar a página inteira.
  const onRetry = () => router.refresh();
  return (
    <div className="flex flex-col gap-6">
      {periodo ? <PeriodBar periodo={periodo} mesMin={periodoMin} /> : null}
      <ReportFilters filtros={todosFiltros} options={options} />
      {secoes.map((sd) => (
        <div key={sd.secao.id}>{renderSecao(sd, report, onRetry)}</div>
      ))}
      <p className="text-xs text-muted-foreground">
        {freshness
          ? `Atualizado em ${freshness.toLocaleString("pt-BR")}`
          : "Atualizado em — (relatório ainda sendo preparado)"}
      </p>
    </div>
  );
}
