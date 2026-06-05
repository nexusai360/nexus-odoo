/**
 * B2. Helpers puros do monitoramento da bubble. SEM "use server" (o arquivo de
 * actions só pode exportar funções async; helpers síncronos e tipos moram aqui).
 *
 * Dois eixos de qualidade, sempre lado a lado:
 * - AVALIAÇÃO: o que o usuário votou (MessageFeedback).
 * - PERÍCIA: o que a plataforma julgou (ConversationQualityEvaluation, juiz).
 * Ambos colapsam nos mesmos 4 baldes e usam a MESMA fórmula de acerto.
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
 * Acurácia = certos / total de classificações. Parcial/errado/alucinou contam
 * só no denominador (não há peso para parcial). Sem classificações, retorna
 * null. Vale igual para Avaliação (usuário) e Perícia (plataforma).
 */
export function computeAccuracy(rc: RatingCounts): number | null {
  const total = rc.CORRETO + rc.PARCIAL + rc.ERRADO + rc.ALUCINOU;
  if (total === 0) return null;
  return Math.round((100 * rc.CORRETO) / total);
}

/**
 * Colapsa o status do juiz (EvalStatus) num dos 4 baldes da Perícia, para
 * ficar comparável com a Avaliação do usuário:
 * - CORRETO -> CORRETO
 * - PARCIAL -> PARCIAL
 * - ERRADO / FALHA_TECNICA -> ERRADO (falha técnica não é resposta correta)
 * - FORA_DO_ESCOPO -> ALUCINOU (o usuário trata alucinou == fora do escopo)
 * - PENDENTE (ou desconhecido) -> null (não-terminal, não entra na conta)
 */
export function periciaBucket(status: string): keyof RatingCounts | null {
  switch (status) {
    case "CORRETO":
      return "CORRETO";
    case "PARCIAL":
      return "PARCIAL";
    case "ERRADO":
    case "FALHA_TECNICA":
      return "ERRADO";
    case "FORA_DO_ESCOPO":
      return "ALUCINOU";
    default:
      return null;
  }
}
