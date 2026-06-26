/**
 * Pontuacao com DECAIMENTO por recencia (meia-vida). Usado para rankear topicos,
 * keywords e perguntas recorrentes do perfil , evita que preferencia velha "grude".
 *
 * Modulo PURO (sem deps). Spec 6.4.
 */

/** Meia-vida do score: a cada 30 dias sem ver, o peso cai pela metade. */
export const HALF_LIFE_DAYS = 30;
/** Abaixo deste score, o item sai do perfil. */
export const MIN_SCORE = 0.15;

const DAY_MS = 24 * 60 * 60 * 1000;

/** score = count * 0.5 ^ (idadeDias / HALF_LIFE_DAYS). nowMs/lastSeenMs em epoch ms. */
export function decayedScore(count: number, lastSeenMs: number, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - lastSeenMs) / DAY_MS);
  return count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Mantem itens com score >= MIN_SCORE, ordenados por score desc (estavel). */
export function rankByScore<T extends { score: number }>(items: T[]): T[] {
  return items
    .filter((i) => i.score >= MIN_SCORE)
    .slice()
    .sort((a, b) => b.score - a.score);
}
