/**
 * Sanitiza texto de prompt antes de gravar. Remove caracteres que o projeto
 * vetou (travessao e en-dash, sempre redigiveis com virgula ou ponto) e
 * normaliza ruido de copia-e-cola (reticencias unicode, aspas francesas,
 * non-breaking spaces). Preserva acentos, cedilha, e quebra de paragrafo.
 *
 * Aplicacao tipica: zod transformer nas Server Actions que aceitam texto
 * livre de prompt (identityBase, personality, tone, guardrails,
 * advancedOverride, terminology). Idempotente.
 *
 * Modulo puro. Nunca importa server-only.
 */

export function sanitizePromptText(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[,,]/g, ",") // em-dash + en-dash
    .replace(/…/g, "...") // reticencias unicode
    .replace(/[«]/g, '"') // aspas francesas «
    .replace(/[»]/g, '"') // aspas francesas »
    .replace(/[    ]/g, " ") // non-breaking, figure, thin, narrow nbsp
    .replace(/[ \t]+/g, " ") // colapsa runs de espacos/tabs
    .replace(/\n{3,}/g, "\n\n") // limita quebras consecutivas a 2
    .trim();
}
