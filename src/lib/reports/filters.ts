// src/lib/reports/filters.ts
import type { ReportSection, ReportFilterValues } from "./types";

/** Converte um param string em inteiro positivo; undefined se inválido. */
function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Mês corrente no formato YYYY-MM (UTC). */
function mesAtual(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mês de N meses atrás no formato YYYY-MM (UTC). */
function mesAtras(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MES_REGEX = /^\d{4}-\d{2}$/;
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

  if (tipos.has("produto")) {
    values.produtoId = toInt(searchParams.produtoId);
  }
  if (tipos.has("armazem")) {
    values.armazemId = toInt(searchParams.armazemId);
  }
  if (tipos.has("familia")) {
    values.familiaId = toInt(searchParams.familiaId);
  }
  if (tipos.has("busca")) {
    const b = searchParams.busca?.trim();
    if (b) values.busca = b;
  }
  if (tipos.has("sentido")) {
    const s = searchParams.sentido;
    if (s === "entrada" || s === "saida") values.sentido = s;
  }
  if (tipos.has("periodo")) {
    const filtro = section.filtros.find((f) => f.tipo === "periodo");
    const meses = Number(filtro?.default ?? "3");
    const de = searchParams.periodoDe;
    const ate = searchParams.periodoAte;
    values.periodoDe = de && MES_REGEX.test(de) ? de : mesAtras(meses);
    values.periodoAte = ate && MES_REGEX.test(ate) ? ate : mesAtual();
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
