// src/lib/reports/builder/report-entry-schema.ts
// Validacao Zod da ficha do construtor (BuilderReportEntry).
import { z } from "zod";
import { ICONES_VALIDOS, SHAPES_DERIVADOS } from "./types";
import type { BuilderReportEntry } from "./types";

const REPORT_TEMPLATES = [
  "KPICard",
  "KPIRow",
  "DataTable",
  "BarChart",
  "LineChart",
  "PieChart",
] as const;

const FILTER_TIPOS = ["armazem", "familia", "marca", "sentido", "faixaDias"] as const;

const filtroSchema = z.object({
  tipo: z.enum(FILTER_TIPOS),
  default: z.string().optional(),
});

const secaoSchema = z.object({
  id: z.string().min(1),
  template: z.enum(REPORT_TEMPLATES),
  fato: z.string().min(1),
  shapeDerivado: z.enum(SHAPES_DERIVADOS),
  config: z.record(z.string(), z.unknown()),
  filtros: z.array(filtroSchema),
});

const parametroSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(["armazem", "familia", "periodo"]),
  secoes: z.array(z.string()),
});

export const reportEntrySchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  dominio: z.string().min(1),
  descricao: z.string().optional(),
  icone: z.enum(ICONES_VALIDOS).optional(),
  modeloFonte: z.string().optional(),
  tipo: z.enum(["tela_cheia", "widget"]),
  parametros: z.array(parametroSchema),
  schemaVersion: z.number().int().positive(),
  secoes: z.array(secaoSchema),
  temporal: z.object({ periodoPadrao: z.string() }).optional(),
});

export type ValidacaoResult =
  | { ok: true; entry: BuilderReportEntry }
  | { ok: false; erros: string[] };

/** Valida um input cru como ficha do construtor. */
export function validarReportEntry(input: unknown): ValidacaoResult {
  const r = reportEntrySchema.safeParse(input);
  if (r.success) return { ok: true, entry: r.data as BuilderReportEntry };
  return {
    ok: false,
    erros: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
