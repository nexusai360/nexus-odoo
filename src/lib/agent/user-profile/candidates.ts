/**
 * Selecao de usuarios candidatos a (re)construcao do perfil + piso de historico.
 *
 * Piso (spec 6.6): so destila a partir de >= MIN_CONVERSATIONS conversas E >= MIN_MESSAGES
 * mensagens. Reconstroi quando ha mensagem nova desde o ultimo build (ou nunca buildou).
 *
 * Modulo PURO. Recebe stats ja agregadas (o SQL vive no worker).
 */

// Calibrado contra o dado real (prod 2026-06-19): o uso in-app e nascente e fragmentado , o
// usuario mais ativo tem 2 conversas / 28 mensagens. Contagem de conversas e um gate ruim de
// engajamento; mensagens captura melhor. Piso: >= 1 conversa E >= 12 mensagens (3 usuarios reais
// passam a ter perfil hoje). Sobe conforme o uso cresce. Decisao registrada na spec 6.6.
export const MIN_CONVERSATIONS = 1;
export const MIN_MESSAGES = 12;

export interface CandidateStat {
  userId: string;
  conversations: number;
  messages: number;
  lastMessageMs: number;
  profileBuiltMs: number | null;
}

export function isEligibleCandidate(s: CandidateStat): boolean {
  if (s.conversations < MIN_CONVERSATIONS) return false;
  if (s.messages < MIN_MESSAGES) return false;
  if (s.profileBuiltMs === null) return true; // nunca buildou
  return s.lastMessageMs > s.profileBuiltMs; // ha conversa nova desde o ultimo build
}

export function selectEligible(stats: CandidateStat[]): string[] {
  return stats.filter(isEligibleCandidate).map((s) => s.userId);
}
