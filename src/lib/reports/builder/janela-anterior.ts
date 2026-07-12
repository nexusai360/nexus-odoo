// src/lib/reports/builder/janela-anterior.ts
// Helpers puros para o delta periodo-a-periodo dos KPIs temporais. A janela
// anterior so existe quando ha um periodo explicito (de..ate em "YYYY-MM"); o
// delta so e honesto quando ha uma base anterior valida e != 0.
//
// A janela anterior tambem obedece a DATA DE INICIO DAS ANALISES: a plataforma nao
// analisa nada antes dela, entao nao existe base de comparacao la atras. Se a janela
// anterior termina antes do corte, NAO ha delta (null); se ela cruza o corte, o inicio
// e grampeado (a base fica menor, mas so cobre o que a plataforma analisa).
import { corteAtual } from "@/lib/corte-dados";

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
 * Janela imediatamente anterior, de mesmo tamanho, ja grampeada a data de inicio das
 * analises. Ex.: Jan..Mar 2026 (3 meses) -> Out..Dez 2025.
 *
 * Retorna null quando:
 *   - falta um dos limites ou o formato nao e "YYYY-MM" (sem periodo, sem base);
 *   - a janela anterior termina ANTES do mes do corte , ali a plataforma nao analisa
 *     nada, entao a base seria zero e o delta, inventado (ex.: comparar mar/2026 com
 *     fev/2026 quando as analises comecam em 16/03/2026 devolveria "+infinito").
 *
 * Quando a janela anterior CRUZA o corte, o inicio e puxado para o mes do corte: a base
 * fica menor, porem so com o que a plataforma de fato analisa.
 */
export function janelaAnterior(
  de: string | undefined,
  ate: string | undefined,
  corte: string = corteAtual(),
): { de: string; ate: string } | null {
  const iDe = indiceMes(de);
  const iAte = indiceMes(ate);
  if (iDe === null || iAte === null || iAte < iDe) return null;
  const span = iAte - iDe + 1;
  const priorAte = iDe - 1;
  const priorDe = priorAte - (span - 1);

  const iCorte = indiceMes(corte.slice(0, 7));
  if (iCorte !== null) {
    // Janela anterior inteiramente antes do inicio das analises: sem base, sem delta.
    if (priorAte < iCorte) return null;
    // Cruza o corte: grampeia o inicio no mes do corte.
    if (priorDe < iCorte) return { de: deIndice(iCorte), ate: deIndice(priorAte) };
  }
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
