/**
 * Preenchimento de chips de sugestão (HARD_FALLBACK + padding) compartilhado
 * entre a `SuggestionsBar` da bubble viva e o painel de monitoramento.
 *
 * Por que existe: a bubble sempre exibe `targetCount` chips abaixo da resposta;
 * quando o suggester contextual / o canal [[suggestions]] vêm curtos, a barra
 * completa com perguntas genéricas de gestor (HARD_FALLBACK). O monitoramento
 * lê o snapshot cru do banco, que NÃO tem esse complemento. Mantendo a lógica
 * num único lugar, os dois lados mostram exatamente o mesmo conjunto de chips
 * (e a mesma contagem "N sugestões"), sem drift entre componentes.
 */

// Última camada de defesa contra "bolha sem chips" (bug 2026-05-24). Distinto
// das welcome para evitar repetição das chips de entrada (feedback 2026-05-24).
export const HARD_FALLBACK = [
  "Detalhe o faturamento dos últimos 7 dias.",
  "Qual cliente mais comprou neste mês?",
  "Compare o estoque atual com o do mês passado.",
  "Quais notas fiscais foram emitidas hoje?",
  "Quais títulos vencem nos próximos 5 dias?",
];

/**
 * Dedup + corte em `targetCount` (1..5) + complemento com HARD_FALLBACK até
 * atingir o alvo. É a lógica que a SuggestionsBar aplica no render; o monitor
 * reusa para refletir o que o usuário REALMENTE viu na bubble.
 */
export function padSuggestions(
  suggestions: readonly string[],
  targetCount = 3,
): string[] {
  const cap = Math.min(Math.max(1, targetCount), 5);
  const seen = new Set<string>();
  const final: string[] = [];
  for (const s of suggestions) {
    const t = (s ?? "").trim();
    if (t && !seen.has(t) && final.length < cap) {
      seen.add(t);
      final.push(t);
    }
  }
  for (const s of HARD_FALLBACK) {
    if (final.length >= cap) break;
    if (!seen.has(s)) {
      seen.add(s);
      final.push(s);
    }
  }
  return final;
}
