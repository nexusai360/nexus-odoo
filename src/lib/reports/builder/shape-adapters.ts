// src/lib/reports/builder/shape-adapters.ts
// Adaptadores puros: convertem o dado cru de uma fonte (RawSourceData) no
// shape que cada template consome. A derivacao especifica (qual query roda
// por shape) vive no produtor do registry (B3); aqui ficam as transformacoes
// genericas e testaveis.
import type { RawSourceData } from "./types";

/** Linha de tabela: as proprias linhas da fonte. */
export type LinhaTabela = Record<string, unknown>;

/** Item de uma agregacao categorica (uma barra/fatia). */
export interface ItemCategorico {
  rotulo: string;
  valor: number;
}

/** Shape "tabela": passa as linhas adiante. */
export function adaptarTabela(raw: RawSourceData): LinhaTabela[] {
  return raw.linhas;
}

/** Shape "kpis": os escalares ja calculados pela fonte. */
export function adaptarKpis(raw: RawSourceData): Record<string, number> {
  return raw.kpis ?? {};
}

/**
 * Shape "agregacaoCategorica": linhas `{ rotulo, valor }` ordenadas por valor
 * desc e limitadas a topN (default 8).
 */
export function adaptarAgregacaoCategorica(
  raw: RawSourceData,
  opts: { topN?: number } = {},
): ItemCategorico[] {
  const topN = opts.topN ?? 8;
  return raw.linhas
    .map((l) => ({
      rotulo: String((l as Record<string, unknown>).rotulo ?? ""),
      valor: Number((l as Record<string, unknown>).valor ?? 0),
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, topN);
}
