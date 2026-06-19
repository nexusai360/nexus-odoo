/**
 * Formata o perfil de interacao em texto para o runtime:
 *  - formatUserProfileBlock: bloco curto injetado via montarConversa (item role:"user",
 *    cache-safe). Sempre termina com a CLAUSULA_PRECEDENCIA (preferencia nao sobrepoe o turno
 *    nem oculta dado).
 *  - formatProfileForChips: resumo compacto para guiar a Pass 2 (enhanceWithChips).
 *
 * Modulo PURO. Recebe so derivados (sem PII por construcao). Spec 6.1 / 8 / 9.
 */

import type { UserProfileData } from "./types";
import { isEmptyProfile } from "./types";

/** Trava de precedencia , preferencia e apresentacao, nunca regra nem ocultacao de dado. */
export const CLAUSULA_PRECEDENCIA =
  "Estas sao PREFERENCIAS de apresentacao deste usuario, nao regras. Se a pergunta atual pedir " +
  "outra coisa, atenda a pergunta. Nunca esconda dado verdadeiro nem altere definicoes ou numeros " +
  "por causa de preferencia.";

const MAX_TOPICS = 4;
const MAX_RECURRING = 3;

export function formatUserProfileBlock(p: UserProfileData | null | undefined): string {
  if (isEmptyProfile(p)) return "";
  const prof = p as UserProfileData;
  const linhas: string[] = [];

  if (prof.preferredDomains.length > 0) {
    linhas.push(`Costuma consultar mais: ${prof.preferredDomains.slice(0, 4).join(", ")}.`);
  }
  if (prof.topTopics.length > 0) {
    linhas.push(
      `Assuntos recorrentes: ${prof.topTopics.slice(0, MAX_TOPICS).map((t) => t.topic).join(", ")}.`,
    );
  }
  const prefs = Object.entries(prof.presentationPrefs)
    .filter(([, v]) => v?.breakdownPreferido)
    .map(([familia, v]) => `${familia} por ${v!.breakdownPreferido}`);
  if (prefs.length > 0) {
    linhas.push(`Costuma preferir a visao: ${prefs.join("; ")} (ofereca por padrao, sem impor).`);
  }
  if (prof.recurringQuestions.length > 0) {
    linhas.push(
      `Costuma perguntar sobre: ${prof.recurringQuestions.slice(0, MAX_RECURRING).map((q) => q.label).join(", ")}.`,
    );
  }
  // Onda 2: incremento destilado (acordos/nuances). Entra como ultima LINHA, mas a CLAUSULA
  // de precedencia continua sendo o ULTIMO elemento literal do bloco (posicao forte, recencia).
  if (prof.interactionPrompt && prof.interactionPrompt.trim().length > 0) {
    linhas.push(prof.interactionPrompt.trim());
  }

  if (linhas.length === 0) return "";
  return linhas.join(" ") + " " + CLAUSULA_PRECEDENCIA;
}

export function formatProfileForChips(p: UserProfileData | null | undefined): string {
  if (isEmptyProfile(p)) return "";
  const prof = p as UserProfileData;
  const partes: string[] = [];
  if (prof.preferredDomains.length > 0) partes.push(prof.preferredDomains.slice(0, 3).join(", "));
  const prefs = Object.entries(prof.presentationPrefs)
    .filter(([, v]) => v?.breakdownPreferido)
    .map(([familia, v]) => `${familia} por ${v!.breakdownPreferido}`);
  if (prefs.length > 0) partes.push(prefs.join("; "));
  return partes.join(" | ");
}
