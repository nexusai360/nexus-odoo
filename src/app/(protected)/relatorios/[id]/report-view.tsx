"use client";

import type { ReportEntry, ReportSection, ReportState } from "@/lib/reports/types";
import { ReportFilters, type FilterOptions } from "@/components/reports/report-filters";
import { KPICard } from "@/components/charts/kpi-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { BarChartCard } from "@/components/charts/bar-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import { PieChartCard } from "@/components/charts/pie-chart";

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
}

function renderSecao({ secao, estado, dados }: SecaoComDados) {
  const cfg = secao.config;
  switch (secao.template) {
    case "KPICard": {
      const d = dados as { total?: number };
      return (
        <KPICard
          valor={d?.total ?? 0}
          rotulo={String(cfg.rotulo ?? "")}
          formato="inteiro"
          estado={estado}
        />
      );
    }
    case "DataTable": {
      const d = dados as { linhas?: unknown[] } | unknown[];
      const linhas = Array.isArray(d) ? d : (d?.linhas ?? []);
      return (
        <DataTable
          columns={cfg.colunas as ColumnDef<Record<string, unknown>>[]}
          rows={linhas as Record<string, unknown>[]}
          estado={estado}
          searchable={Boolean(cfg.searchable)}
        />
      );
    }
    case "BarChart": {
      const d = dados as { marca?: unknown[] } | unknown[];
      const data = Array.isArray(d) ? d : (d?.marca ?? []);
      return (
        <BarChartCard
          data={data as Record<string, unknown>[]}
          config={cfg as never}
          estado={estado}
        />
      );
    }
    case "LineChart":
      return (
        <LineChartCard
          data={dados as Record<string, unknown>[]}
          config={cfg as never}
          estado={estado}
        />
      );
    case "PieChart": {
      const d = dados as { familia?: unknown[] } | unknown[];
      const data = Array.isArray(d) ? d : (d?.familia ?? []);
      return (
        <PieChartCard
          data={data as Record<string, unknown>[]}
          config={cfg as never}
          estado={estado}
        />
      );
    }
    default:
      return null;
  }
}

/** Renderiza um relatório: filtros, seções em sequência e freshness. */
export function ReportView({
  report, secoes, freshness, options,
}: ReportViewProps) {
  const todosFiltros = report.secoes.flatMap((s) => s.filtros);
  return (
    <div className="flex flex-col gap-6">
      <ReportFilters filtros={todosFiltros} options={options} />
      {secoes.map((sd) => (
        <div key={sd.secao.id}>{renderSecao(sd)}</div>
      ))}
      <p className="text-xs text-muted-foreground">
        {freshness
          ? `Atualizado em ${freshness.toLocaleString("pt-BR")}`
          : "Atualizado em — (relatório ainda sendo preparado)"}
      </p>
    </div>
  );
}
