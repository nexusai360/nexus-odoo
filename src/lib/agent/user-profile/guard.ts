/**
 * Circuit-breaker do perfil destilado (Onda 2). Como a destilacao grava SEM gate, mede o sinal
 * de qualidade ANTES x DEPOIS do perfil ativo e quarentena (reset) se piorar. Spec 6.7/7.
 *
 * HONESTIDADE (declarada): em PRODUCAO o sinal e ESCASSO , o juiz de qualidade roda host-side
 * (local-only) e o feedback explicito costuma vir OFF. Logo, com o volume atual o breaker
 * raramente dispara sozinho; a DEFESA PRIMARIA hoje e a UI de auditoria + reset manual do
 * super_admin (resetUserAgentProfile). O breaker e backstop para quando o volume crescer.
 *
 * Nucleo PURO (`piorou`) testavel; a coleta do sinal vive no caller host-side.
 */

/** Sinal de qualidade por usuario numa janela. */
export interface QualitySignal {
  acertoRate: number; // 0..1 (avaliacoes CORRETO / total avaliado)
  negFeedbackRate: number; // 0..1 (feedback errado+alucinou / total votado)
  amostra: number; // nº de itens com sinal na janela
}

/** Amostra minima para confiar numa comparacao (nao quarentenar no escuro). */
export const MIN_AMOSTRA = 5;
/** Queda de acerto que caracteriza regressao. */
export const QUEDA_ACERTO = 0.15;
/** Alta de feedback negativo que caracteriza regressao. */
export const ALTA_NEG = 0.15;

/**
 * Retorna true se o sinal ATUAL (com perfil ativo) piorou o suficiente vs a baseline (sem perfil).
 * Conservador: amostra insuficiente => false (nunca quarentena no escuro).
 */
export function piorou(
  baseline: QualitySignal,
  atual: QualitySignal,
  minAmostra: number = MIN_AMOSTRA,
): boolean {
  if (atual.amostra < minAmostra) return false;
  const acertoCaiu = baseline.acertoRate - atual.acertoRate >= QUEDA_ACERTO;
  const negSubiu = atual.negFeedbackRate - baseline.negFeedbackRate >= ALTA_NEG;
  return acertoCaiu || negSubiu;
}
