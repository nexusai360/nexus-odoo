/**
 * B2. Helpers puros do monitoramento da bubble. SEM "use server" (o arquivo de
 * actions só pode exportar funções async; helpers síncronos e tipos moram aqui).
 */

export type RatingCounts = {
  CORRETO: number;
  PARCIAL: number;
  ERRADO: number;
  ALUCINOU: number;
};

export function zeroCounts(): RatingCounts {
  return { CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 };
}

/**
 * Acurácia ponderada: acertos valem 1, parciais valem 0.5; erros e alucinações
 * valem 0. Sem votos, retorna null (não há base para calcular).
 */
export function computeAccuracy(rc: RatingCounts): number | null {
  const total = rc.CORRETO + rc.PARCIAL + rc.ERRADO + rc.ALUCINOU;
  if (total === 0) return null;
  return Math.round((100 * (rc.CORRETO + 0.5 * rc.PARCIAL)) / total);
}
