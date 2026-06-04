/**
 * Travas das sugestoes de pergunta (chips) do Agente Nex. Modulo PURO.
 *
 * Trava 1 , nao repetir o que JA foi perguntado: uma sugestao que ja virou
 * pergunta efetiva (o usuario clicou nela, ou digitou algo equivalente) nao
 * deve reaparecer como sugestao na conversa. Match por igualdade normalizada
 * ou similaridade alta (clique manda o texto do chip verbatim).
 *
 * Trava 2 , nao sugerir GAPS conhecidos: perguntas que a IA ja registrou como
 * sem-resposta (feature_requests) nao podem ser sugeridas a ninguem. Como o
 * resumo do gap e uma reformulacao, o match e por sobreposicao de tokens
 * (Jaccard), nao por igualdade.
 */

import { TOOL_TO_QUESTION } from "./personalized-suggestions/templates";

/** Normaliza para comparacao: minusculo, sem acento, sem pontuacao, colapsado. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATCH_STOPWORDS = new Set([
  "o", "a", "os", "as", "de", "do", "da", "dos", "das", "com", "sem", "em",
  "no", "na", "nos", "nas", "para", "por", "e", "ou", "que", "um", "uma",
  "qual", "quais", "me", "voce", "vc", "pode", "mostrar", "quanto", "quantos",
  "quantas", "ao", "aos", "neste", "nesta", "esse", "essa", "esses", "essas",
  "the", "of",
]);

/** Conjunto de tokens significativos (sem stopwords, >=3 chars ou numero). */
export function tokenSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of normalizeForMatch(s).split(" ")) {
    if (!tok) continue;
    if (MATCH_STOPWORDS.has(tok)) continue;
    if (tok.length < 3 && !/\d/.test(tok)) continue;
    out.add(tok);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Limiares calibrados contra dado real (gaps + catalogo capaz). */
const ASKED_SIM = 0.82; // ja-perguntada e quase identica (clique manda verbatim)
const GAP_SIM = 0.5; // gap e reformulado (verbo conjuga: "lista"/"liste")
const CAPABLE_SIM = 0.7; // whitelist: se bate com pergunta capaz, NUNCA bloqueia

// Catalogo de perguntas que o agente SABE responder (TOOL_TO_QUESTION). Usado
// como whitelist da trava 2: um gap pode ter sido mal-registrado e colidir com
// uma pergunta respondivel; nesse caso a pergunta respondivel vence (nao bloqueia).
const CAPABLE_TOKENS: Set<string>[] = Object.values(TOOL_TO_QUESTION).map(tokenSet);

/**
 * Filtra a lista de sugestoes removendo (1) as ja perguntadas nesta conversa e
 * (2) as que batem com gaps conhecidos , exceto quando a sugestao tambem casa
 * com o catalogo de perguntas capazes (whitelist), caso em que ela e mantida.
 * Mantem a ordem das que sobram e deduplica.
 */
export function filterSuggestions(
  suggestions: readonly string[],
  opts: { asked?: readonly string[]; gaps?: readonly string[] },
): string[] {
  const askedNorm = new Set((opts.asked ?? []).map(normalizeForMatch));
  const askedTokens = (opts.asked ?? []).map(tokenSet);
  const gapTokens = (opts.gaps ?? []).map(tokenSet);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of suggestions) {
    const norm = normalizeForMatch(s);
    if (!norm) continue;
    if (seen.has(norm)) continue; // dedup interno
    if (askedNorm.has(norm)) continue; // trava 1 (exata)
    const toks = tokenSet(s);
    if (askedTokens.some((a) => jaccard(toks, a) >= ASKED_SIM)) continue; // trava 1 (similar)
    // trava 2 (gap), com whitelist do catalogo capaz.
    const hitsGap = gapTokens.some((g) => jaccard(toks, g) >= GAP_SIM);
    if (hitsGap) {
      const isCapable = CAPABLE_TOKENS.some(
        (cap) => jaccard(toks, cap) >= CAPABLE_SIM,
      );
      if (!isCapable) continue; // gap real (nao respondivel) -> bloqueia
    }
    seen.add(norm);
    out.push(s);
  }
  return out;
}
