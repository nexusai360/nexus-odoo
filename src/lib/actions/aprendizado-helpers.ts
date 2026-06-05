/**
 * B3. Helpers puros do Aprendizado (cruzamento Avaliação × Perícia). SEM
 * "use server": tipos e lógica síncrona testável; a action async fica em
 * `aprendizado.ts`.
 */

import type { RatingCounts } from "./monitoramento-bubble-helpers";

export type Bucket = keyof RatingCounts; // CORRETO | PARCIAL | ERRADO | ALUCINOU

export const BUCKETS: Bucket[] = ["CORRETO", "PARCIAL", "ERRADO", "ALUCINOU"];

/** Score de qualidade por balde (maior = melhor). Usado na severidade. */
const SCORE: Record<Bucket, number> = {
  CORRETO: 3,
  PARCIAL: 2,
  ERRADO: 1,
  ALUCINOU: 0,
};

/** Matriz 4×4 (linha = avaliação do usuário, coluna = perícia). */
export type Matrix = Record<Bucket, Record<Bucket, number>>;

export function emptyMatrix(): Matrix {
  const m = {} as Matrix;
  for (const u of BUCKETS) {
    m[u] = { CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 };
  }
  return m;
}

/**
 * Severidade de uma discordância para ordenar a lista. Destaca o caso mais
 * perigoso: o JUIZ superestima (acha bom) e o USUÁRIO discorda (achou ruim).
 * Primário = quanto o juiz superestimou em relação ao usuário (judge − user);
 * positivo grande = overconfidence. Desempate = tamanho do gap absoluto.
 */
export function disagreementSeverity(user: Bucket, judge: Bucket): number {
  const diff = SCORE[judge] - SCORE[user]; // >0: juiz mais otimista que o usuário
  return diff * 10 + Math.abs(diff);
}

/** Concordância = soma da diagonal / total cruzado (0..100, null se vazio). */
export function agreementPct(m: Matrix): number | null {
  let total = 0;
  let agree = 0;
  for (const u of BUCKETS) {
    for (const j of BUCKETS) {
      total += m[u][j];
      if (u === j) agree += m[u][j];
    }
  }
  if (total === 0) return null;
  return Math.round((100 * agree) / total);
}

/** Totais úteis da matriz: cruzados e discordâncias (off-diagonal). */
export function matrixTotals(m: Matrix): { crossed: number; disagreements: number } {
  let crossed = 0;
  let disagreements = 0;
  for (const u of BUCKETS) {
    for (const j of BUCKETS) {
      crossed += m[u][j];
      if (u !== j) disagreements += m[u][j];
    }
  }
  return { crossed, disagreements };
}

/**
 * Agrega listas de `patterns` (taxonomia das perícias não-corretas) em uma
 * contagem ordenada desc. Ignora vazios.
 */
export function aggregatePatterns(
  lists: Array<string[] | null | undefined>,
): Array<{ pattern: string; count: number }> {
  const counts = new Map<string, number>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (typeof p !== "string" || p.length === 0) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}
