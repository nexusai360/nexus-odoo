/**
 * Tipos do perfil de interacao por usuario (personalizacao adaptativa, Onda 1).
 *
 * Guarda APENAS derivados , nenhuma frase original do usuario:
 * - recurringQuestions.label e um tema de vocabulario FECHADO (normalizar-pergunta.ts),
 *   nunca trecho do texto do usuario;
 * - presentationPrefs e SO apresentacao (qual visao/breakdown), nunca filtro de recorte de dado.
 *
 * Spec: docs/superpowers/specs/2026-06-19-agente-personalizacao-por-usuario-design.md
 */

/** Assunto preferido (derivado de topic_tags), pontuado por frequencia x recencia. */
export interface TopTopic {
  topic: string;
  score: number;
  lastSeenAt: string;
}

/** Palavra-chave derivada. */
export interface TopKeyword {
  keyword: string;
  score: number;
}

/** Pergunta recorrente. `label` e SEMPRE um tema de vocabulario fechado (PII-safe). */
export interface RecurringQuestion {
  label: string;
  count: number;
  lastSeenAt: string;
}

/**
 * Preferencia de breakdown por familia de metrica. SO apresentacao (qual visao). NUNCA
 * filtro de recorte de dado (ex.: "so aprovados") , isso oculta dado e e proibido (spec 6.2).
 * Ex.: { faturamento: { breakdownPreferido: "empresa" } }.
 */
export interface FamilyPref {
  breakdownPreferido?: string;
}
export type PresentationPrefs = Record<string, FamilyPref | undefined>;

/** Dados derivados do perfil (o que o build produz e o store persiste/le). */
export interface UserProfileData {
  topTopics: TopTopic[];
  topKeywords: TopKeyword[];
  preferredDomains: string[];
  recurringQuestions: RecurringQuestion[];
  presentationPrefs: PresentationPrefs;
  /** Texto curto destilado por LLM (Onda 2, host-side). null quando ainda nao destilado. */
  interactionPrompt?: string | null;
}

/** Perfil vazio canonico (degradacao graciosa: usuario sem historico). */
export const EMPTY_PROFILE: UserProfileData = {
  topTopics: [],
  topKeywords: [],
  preferredDomains: [],
  recurringQuestions: [],
  presentationPrefs: {},
};

/** true quando o perfil nao tem nenhum sinal (equivale a nao personalizar). */
export function isEmptyProfile(p: UserProfileData | null | undefined): boolean {
  if (!p) return true;
  return (
    p.topTopics.length === 0 &&
    p.topKeywords.length === 0 &&
    p.preferredDomains.length === 0 &&
    p.recurringQuestions.length === 0 &&
    Object.keys(p.presentationPrefs).length === 0 &&
    !(p.interactionPrompt && p.interactionPrompt.trim().length > 0)
  );
}
