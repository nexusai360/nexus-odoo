// src/lib/reports/types.ts
import type { ReportDomainId } from "@/lib/reports/domains";
import type { PeriodoPresetPadrao } from "@/lib/reports/periodo";

/** Tipo de cada controle de filtro de uma seção. */
export type ReportFilterTipo =
  | "armazem"
  | "familia"
  | "marca"
  | "sentido"
  | "faixaDias";

/** Declaração de um filtro numa seção do catálogo. */
export interface ReportFilter {
  tipo: ReportFilterTipo;
  /** Valor default quando o searchParam está ausente. */
  default?: string;
}

/** Templates de visualização disponíveis. */
export type ReportTemplate =
  | "KPICard"
  | "KPIRow"
  | "DataTable"
  | "BarChart"
  | "LineChart"
  | "PieChart"
  | "Funnel"
  | "Waterfall";

/** Uma seção de relatório , um template alimentado por um fato. */
export interface ReportSection {
  /** Id da seção dentro do relatório (usado como chave de render). */
  id: string;
  template: ReportTemplate;
  /** Nome do fato lido , chave em FatoBuildState. */
  fato: string;
  /** Config declarativa repassada ao componente do template. */
  config: Record<string, unknown>;
  filtros: ReportFilter[];
}

/** Entrada do catálogo de relatórios. */
export interface ReportEntry {
  id: string;
  titulo: string;
  dominio: ReportDomainId;
  descricao: string;
  /**
   * Nome do ícone (string serializável, não componente) , resolvido para
   * `LucideIcon` pelos client components via `resolveReportIcon`.
   * Nomes válidos: "Boxes" | "Coins" | "ArrowLeftRight" | "Clock"
   *               | "TrendingUp" | "PieChart".
   */
  icone: string;
  /** Modelo Odoo cuja sync data o "atualizado em". */
  modeloFonte: string;
  secoes: ReportSection[];
  /** Declara que o relatório tem dimensão temporal. Ausente = snapshot. */
  temporal?: {
    periodoPadrao: PeriodoPresetPadrao;
  };
}

/**
 * Filtros já parseados de searchParams para os tipos certos.
 * Todos opcionais , quando ausente, a query aplica o seu default.
 */
export interface ReportFilterValues {
  armazemId?: number;
  familiaId?: number;
  /** Mês inicial do período, formato YYYY-MM. */
  periodoDe?: string;
  /** Mês final do período, formato YYYY-MM. */
  periodoAte?: string;
  sentido?: "entrada" | "saida";
  /** Faixa de dias de imobilização: 30, 60 ou 90 (90 = "90+"). */
  faixaDias?: 30 | 60 | 90;
}

/** Estado de um fato no momento da leitura (spec §3.4). */
export type ReportState = "ok" | "preparando" | "vazio" | "erro";

/** Retorno padrão de uma query de leitura de relatório. */
export interface ReportResult<T> {
  estado: ReportState;
  dados: T;
  freshness: Date | null;
}
