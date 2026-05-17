// src/lib/reports/filters.ts
import type { ReportSection, ReportFilterValues } from "./types";

/** Converte um param string em inteiro positivo; undefined se inválido. */
function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const FAIXAS = [30, 60, 90] as const;

/**
 * Converte os searchParams crus (Record<string,string>) nos filtros tipados
 * da seção, aplicando os defaults declarados. Tolerante a valores inválidos:
 * um valor que não casa com o tipo vira undefined (ou cai no default).
 */
export function parseFilters(
  section: ReportSection,
  searchParams: Record<string, string | undefined>,
): ReportFilterValues {
  const values: ReportFilterValues = {};
  const tipos = new Set(section.filtros.map((f) => f.tipo));

  if (tipos.has("armazem")) {
    values.armazemId = toInt(searchParams.armazemId);
  }
  if (tipos.has("familia")) {
    values.familiaId = toInt(searchParams.familiaId);
  }
  if (tipos.has("sentido")) {
    const s = searchParams.sentido;
    if (s === "entrada" || s === "saida") values.sentido = s;
  }
  if (tipos.has("faixaDias")) {
    const filtro = section.filtros.find((f) => f.tipo === "faixaDias");
    const def = Number(filtro?.default ?? "30");
    const raw = Number(searchParams.faixaDias);
    const escolhida = FAIXAS.includes(raw as 30 | 60 | 90)
      ? (raw as 30 | 60 | 90)
      : (FAIXAS.includes(def as 30 | 60 | 90)
          ? (def as 30 | 60 | 90)
          : 30);
    values.faixaDias = escolhida;
  }
  return values;
}
