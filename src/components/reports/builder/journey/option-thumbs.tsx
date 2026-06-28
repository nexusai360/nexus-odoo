// src/components/reports/builder/journey/option-thumbs.tsx
// Thumbnails ilustrativos (so icone) por tipo de visualizacao, para os cards de
// opcao da jornada. v1 nao renderiza o componente real em miniatura (decisao de
// escopo): so um icone que representa o template.
import { BarChart3, PieChart, TrendingUp, Table as TableIcon, Boxes, Filter, BarChartHorizontal, BarChartBig, LayoutGrid, type LucideIcon } from "lucide-react";
import type { ReportTemplate } from "@/lib/reports/types";

const ICONE_TEMPLATE: Record<ReportTemplate, LucideIcon> = {
  KPICard: Boxes,
  KPIRow: Boxes,
  BarChart: BarChart3,
  PieChart: PieChart,
  LineChart: TrendingUp,
  DataTable: TableIcon,
  Funnel: Filter,
  Waterfall: BarChartHorizontal,
  Combo: BarChartBig,
};

/** Icone que representa um template (ou um generico quando ausente). */
export function iconeDoTemplate(template?: ReportTemplate): LucideIcon {
  return template ? ICONE_TEMPLATE[template] : LayoutGrid;
}
