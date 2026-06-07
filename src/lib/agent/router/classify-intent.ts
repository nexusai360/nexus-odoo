// F3 (cerebro, onda 3b): classificador deterministico de intencao da pergunta.
//
// Quatro classes (spec F3 secao 5.1, dossie 5.2):
//  - exaustiva: "todos", "lista completa" => tool retorna ate 50, reporta X de Y.
//  - ranking: "top N", "N maiores" => exige orderBy, retorna exatamente N.
//  - amostragem: "um exemplo", "alguns" => 3 a 5.
//  - pontual (default): consulta de valor unico/agregado.
//
// PRECEDENCIA (resolve colisao "quais sao os 5 maiores"): N explicito e o sinal
// mais forte, logo ranking > amostragem > exaustiva > pontual. Funcao PURA.

export type Intent = "exaustiva" | "ranking" | "amostragem" | "pontual";

/** lowercase + remove acentos (regex de gatilho fica simples e robusta). */
function norm(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUM_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20,
};

/** Sinal de ranking: "top N", "N maiores/menores", "N que mais", "melhores N".
 *  N pode ser digito ou numero por extenso. */
function temRanking(q: string): boolean {
  if (/\btop\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte)\b/.test(q)) return true;
  if (/\b\d+\s+(maiores|menores|melhores|piores|que\s+mais|que\s+menos)\b/.test(q)) return true;
  const numExtensoAlt = Object.keys(NUM_EXTENSO).join("|");
  if (new RegExp(`\\b(${numExtensoAlt})\\s+(maiores|menores|melhores|piores)\\b`).test(q)) return true;
  if (/\b(maior|menor|melhor|pior|top)\b/.test(q) && /\branking\b/.test(q)) return true;
  return false;
}

/** Sinal de amostragem: "um exemplo", "alguns", "uns", "me mostra um". */
function temAmostragem(q: string): boolean {
  return /\b(um\s+exemplo|exemplos?|alguns|algumas|uns|umas|de\s+exemplo)\b/.test(q);
}

/** Sinal de exaustiva: "todos", "todas", "tudo", "lista completa", "listar". */
function temExaustiva(q: string): boolean {
  return /\b(todos|todas|tudo|lista\s+completa|listar|me\s+lista|quero\s+ver\s+(todos|todas|tudo))\b/.test(q);
}

/** Classifica a intencao da pergunta (pt-br). Default: pontual. */
export function classifyIntent(question: string): Intent {
  const q = norm(question);
  // Precedencia: ranking > amostragem > exaustiva > pontual.
  if (temRanking(q)) return "ranking";
  if (temAmostragem(q)) return "amostragem";
  if (temExaustiva(q)) return "exaustiva";
  return "pontual";
}
