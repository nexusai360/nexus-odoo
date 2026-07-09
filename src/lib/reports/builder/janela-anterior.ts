// src/lib/reports/builder/janela-anterior.ts
// Helpers puros para o delta periodo-a-periodo dos KPIs temporais. A janela
// anterior so existe quando ha um periodo explicito (de..ate em "YYYY-MM"); o
// delta so e honesto quando ha uma base anterior valida e != 0.

/** Converte "YYYY-MM" em indice de mes absoluto (ano*12 + mes-1). Null se invalido. */
function indiceMes(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return ano * 12 + (mes - 1);
}

/** Converte um indice de mes absoluto de volta para "YYYY-MM". */
function deIndice(idx: number): string {
  const ano = Math.floor(idx / 12);
  const mes = (idx % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * Janela imediatamente anterior, de mesmo tamanho. Ex.: Jan..Mar 2026 (3 meses)
 * -> Out..Dez 2025. Retorna null se faltar um dos limites ou o formato for invalido.
 */
export function janelaAnterior(
  de: string | undefined,
  ate: string | undefined,
): { de: string; ate: string } | null {
  const iDe = indiceMes(de);
  const iAte = indiceMes(ate);
  if (iDe === null || iAte === null || iAte < iDe) return null;
  const span = iAte - iDe + 1;
  const priorAte = iDe - 1;
  const priorDe = priorAte - (span - 1);
  return { de: deIndice(priorDe), ate: deIndice(priorAte) };
}

export type DeltaDirection = "up" | "down" | "flat";

/**
 * Delta percentual de `atual` sobre `anterior`. Null quando a base e 0 ou
 * invalida (sem base, nao ha variacao honesta a mostrar).
 */
export function calcularDeltaKpi(
  atual: number,
  anterior: number,
): { direction: DeltaDirection; percent: number } | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const direction: DeltaDirection = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  return { direction, percent: Math.round(Math.abs(pct) * 10) / 10 };
}
