// src/lib/reports/builder/shape-adapters.ts
// Adaptadores puros: convertem o dado cru de uma fonte (RawSourceData) no
// shape que cada template consome. A derivacao especifica (qual query roda
// por shape) vive no produtor do registry (B3); aqui ficam as transformacoes
// genericas e testaveis.
import type { CampoMeta, RawSourceData } from "./types";

/** Linha de tabela: as proprias linhas da fonte. */
export type LinhaTabela = Record<string, unknown>;

/** Item de uma agregacao categorica (uma barra/fatia). */
export interface ItemCategorico {
  rotulo: string;
  valor: number;
}

/**
 * Shape "tabela": quando `campos` e fornecido (contrato da fonte), PROJETA cada
 * linha para SOMENTE essas chaves, na ordem declarada. Isso evita vazar campos
 * crus aninhados (ex.: `detalhePorLocal`, um array de objetos) para a tabela ,
 * que apareceriam como "[object Object]". Sem `campos`, passa as linhas como vem.
 */
export function adaptarTabela(raw: RawSourceData, campos?: CampoMeta[]): LinhaTabela[] {
  if (!campos || campos.length === 0) return raw.linhas;
  const keys = campos.map((c) => c.key);
  return raw.linhas.map((linha) => {
    const proj: LinhaTabela = {};
    for (const k of keys) proj[k] = linha[k];
    // Preserva o PRIMEIRO campo de detalhe aninhado (array de objetos) sob a chave
    // reservada `__detalhe`, para o drilldown da tabela , SEM vaza-lo como coluna
    // (ex.: detalhePorLocal do saldo: produto -> locais). Nao aparece como "[object Object]".
    for (const k of Object.keys(linha)) {
      if (keys.includes(k)) continue;
      const v = linha[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
        proj.__detalhe = v;
        break;
      }
    }
    return proj;
  });
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
