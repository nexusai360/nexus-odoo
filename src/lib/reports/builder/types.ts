// src/lib/reports/builder/types.ts
// Tipos base do Construtor de Relatorios (F6, onda 1).
// Estende os tipos da F3 (src/lib/reports/types.ts) sem duplica-los.
import type { ReportDomainId } from "@/lib/reports/domains";
import type {
  ReportEntry,
  ReportSection,
  ReportTemplate,
} from "@/lib/reports/types";

/**
 * Shape derivado que uma fonte oferece a partir do dado cru.
 * Cada template consome um shape (DataTable -> "tabela", PieChart ->
 * "agregacaoCategorica", KPIRow -> "kpis", LineChart -> "serieTemporal").
 */
export const SHAPES_DERIVADOS = [
  "kpis",
  "tabela",
  "agregacaoCategorica",
  "serieTemporal",
] as const;
export type ShapeDerivado = (typeof SHAPES_DERIVADOS)[number];

export function ehShapeDerivado(v: unknown): v is ShapeDerivado {
  return typeof v === "string" && (SHAPES_DERIVADOS as readonly string[]).includes(v);
}

/**
 * Nomes de icone aceitos pela ficha. Espelha o set fechado de
 * `resolveReportIcon` (F3). Nome fora da lista e erro de validacao,
 * nunca fallback silencioso.
 */
export const ICONES_VALIDOS = [
  "Boxes",
  "Coins",
  "ArrowLeftRight",
  "Clock",
  "TrendingUp",
  "PieChart",
] as const;
export type IconeValido = (typeof ICONES_VALIDOS)[number];

export function ehIconeValido(v: unknown): v is IconeValido {
  return typeof v === "string" && (ICONES_VALIDOS as readonly string[]).includes(v);
}

/** Tipo de formatacao de um campo na saida. */
export type CampoTipo = "texto" | "numero" | "moeda" | "percentual";

/** Metadado de um campo disponivel num shape derivado. */
export interface CampoMeta {
  key: string;
  label: string;
  tipo: CampoTipo;
}

/** Dado cru produzido por uma fonte, antes de virar componente. */
export interface RawSourceData {
  linhas: Record<string, unknown>[];
  kpis?: Record<string, number>;
  freshness: Date | null;
}

/** Contrato publico de uma fonte de dado (alimenta o agente). */
export interface SourceContract {
  fato: string;
  modeloFonte: string;
  dominio: ReportDomainId;
  shapes: ShapeDerivado[];
  campos: Partial<Record<ShapeDerivado, CampoMeta[]>>;
}

/**
 * Parametro de ficha (runtime): um controle que o consumidor ajusta e que
 * reflui em uma ou mais secoes.
 */
export interface BuilderParametro {
  id: string;
  tipo: "armazem" | "familia" | "periodo";
  /** Ids das secoes afetadas por este parametro. */
  secoes: string[];
}

/** Secao do construtor: ReportSection + o shape derivado que consome. */
export interface BuilderSection extends ReportSection {
  shapeDerivado: ShapeDerivado;
}

/**
 * Ficha do construtor. Estende `ReportEntry` da F3:
 * - `descricao`/`icone`/`modeloFonte` viram opcionais (default gerado no build);
 * - acrescenta `tipo`, `parametros`, `schemaVersion`;
 * - `secoes` sao `BuilderSection` (com `shapeDerivado`).
 */
export interface BuilderReportEntry
  extends Omit<
    ReportEntry,
    "descricao" | "icone" | "modeloFonte" | "secoes"
  > {
  descricao?: string;
  icone?: IconeValido;
  modeloFonte?: string;
  tipo: "tela_cheia" | "widget";
  parametros: BuilderParametro[];
  schemaVersion: number;
  secoes: BuilderSection[];
}

/** Reexport conveniente para os consumidores do builder. */
export type { ReportTemplate };

/** Templates que efetivamente renderizam (compostos num relatorio rico). */
export const TEMPLATES_ONDA1: ReportTemplate[] = ["KPIRow", "BarChart", "DataTable"];
