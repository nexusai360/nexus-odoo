/**
 * Selecao de usuarios candidatos a (re)construcao do perfil + piso de historico.
 *
 * Piso (spec 6.6): so destila a partir de >= MIN_CONVERSATIONS conversas E >= MIN_MESSAGES
 * mensagens. Reconstroi quando ha mensagem nova desde o ultimo build (ou nunca buildou).
 *
 * Modulo PURO. Recebe stats ja agregadas (o SQL vive no worker).
 */

export const MIN_CONVERSATIONS = 3;
export const MIN_MESSAGES = 10;

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
