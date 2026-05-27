/**
 * Stripper defensivo de placeholder "Xs" da freshness.
 *
 * Bug raiz (12.7% / 624 turnos no audit pre-Onda3a): o LLM sabe que a
 * freshness existe mas emite "atualizado há Xs" como placeholder literal
 * em vez de usar o campo `atualizadoHa` que ja vem pre-computado no
 * envelope do tool result (mcp/lib/freshness.ts §formatAtualizadoHa).
 *
 * Defesa em profundidade:
 *   1. Prompt instrui usar `atualizadoHa` (identity-base).
 *   2. ESTE STRIPPER apaga placeholders literais quando o LLM falha em
 *      seguir a instrucao. Falha-segura: prefere remover a frase a deixar
 *      "Xs" visivel.
 *
 * Padroes alvo (case-insensitive, multilinha):
 *   - "(atualizado ha Xs)"
 *   - "(atualizado ha {x}s)" / "(atualizado ha N s)"
 *   - "atualizado ha Xs"
 *   - "freshness: Xs"
 *   - " · Xs"
 *
 * NAO toca em valores reais como "atualizado ha 30s", "atualizado ha 2h",
 * "atualizado ha 1 dia" etc.
 */

const PATTERNS: ReadonlyArray<RegExp> = [
  // "(atualizado ha Xs)" e variantes com {x}
  /\s*[\(\[]\s*atualizado\s+h[áa]\s+\{?[xX]\}?s\s*[\)\]]/g,
  // "atualizado ha Xs" solto (sem parenteses)
  /\s*[—\-,;·]?\s*atualizado\s+h[áa]\s+\{?[xX]\}?s\b/g,
  // "freshness: Xs"
  /\s*[—\-,;·]?\s*freshness:\s*\{?[xX]\}?s\b/gi,
  // "· Xs" suelto no fim de linha
  /\s+·\s+\{?[xX]\}?s\b/g,
];

export function stripFreshnessPlaceholders(text: string): string {
  let result = text;
  for (const re of PATTERNS) {
    result = result.replace(re, "");
  }
  // Normaliza espacos duplicados deixados pelos cortes.
  result = result.replace(/[ \t]{2,}/g, " ");
  // Remove espacos antes de pontuacao final introduzidos pela edicao.
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  return result;
}
