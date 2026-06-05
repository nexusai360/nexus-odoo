/**
 * Extrator de sugestoes do texto final do agente. Modulo PURO (sem prisma,
 * sem deps assincronas) para ser testavel via jest sem precisar mockar
 * tudo da cadeia do run-agent.
 *
 * Duas fontes:
 *  - Canal explicito `[[suggestions]]:item1|item2|...` no final do texto.
 *  - Caso o canal seja esquecido E o modelo tenha posto perguntas em
 *    bullets/numerada no corpo (caso de desambiguacao tipo "qual visao
 *    voce quer?\n- Opcao A\n- Opcao B"), a extracao de bullet-perguntas
 *    promove esses bullets para chips (cap 7).
 */

/** Regex para extrair sufixo [[suggestions]]. Aceita espaco ou newline antes. */
const SUGGESTIONS_RE = /(?:\s|^)\[\[suggestions\]\]:([^\n]+?)(?:\n|$)/;
/**
 * Strip defensivo: se mesmo apos o extract principal sobrou alguma
 * ocorrencia de "[[suggestions]]" no texto, corta a linha inteira.
 * Trava final contra vazamento do canal pro usuario (regra adicional
 * do usuario - 2026-05-27).
 */
const SUGGESTIONS_GUARD_RE = /\[\[suggestions\]\][^\n]*/g;
/** Tamanho maximo de cada chip de sugestao. */
export const MAX_SUGGESTION_LEN = 80;
/**
 * Hard cap geral para sugestoes (canal [[suggestions]] + extracao). Subiu
 * de 5 para 7 em 2026-05-25 para acomodar bullet-extraction de
 * desambiguacao (ate 7 opcoes quando a IA listou em bullets no corpo).
 */
export const MAX_SUGGESTIONS = 7;
/** Cap especifico para bullets-perguntas extraidos do corpo. */
export const MAX_BULLET_EXTRACTION = 7;

/**
 * Fallback usado quando o modelo nao emite [[suggestions]] e tambem nao ha
 * bullets-perguntas extraiveis. Intencionalmente DISTINTO das welcome
 * suggestions para nao repetir as mesmas perguntas que apareciam na tela
 * inicial.
 */
export const FALLBACK_SUGGESTIONS: readonly string[] = [
  "Detalhe o faturamento dos últimos 7 dias.",
  "Qual cliente mais comprou neste mês?",
  "Compare o estoque atual com o do mês passado.",
  "Quais notas fiscais foram emitidas hoje?",
  "Quais títulos vencem nos próximos 5 dias?",
];

/**
 * Detecta bullet-perguntas TRAILING no texto (caso em que a IA esqueceu de
 * usar o canal [[suggestions]] e fez desambiguacao em bullets no corpo).
 *
 * Heuristica: o texto termina com um bloco de 2-7 bullets curtos (<= 80
 * chars cada), e nas linhas precedentes existe um "?" (pergunta de
 * desambiguacao). So entao consideramos seguro extrair.
 *
 * Retorna `null` quando nao casa (deixa o texto intacto).
 *
 * Exemplo do que captura (formato do bug reportado em 2026-05-25):
 *   "Para listar certinho, qual visao voce precisa?
 *
 *   - Somente autorizadas
 *   - Todas (autorizadas + em digitacao + rejeitadas + inutilizadas)"
 */
export function extractBulletQuestions(
  text: string,
): { message: string; bullets: string[] } | null {
  const bulletLineRe = /^[\s]*(?:[-*•]|\d+[.)])\s+(.{1,120})$/;
  const lines = text.split("\n");
  // Trim trailing empty lines.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  // Walk de tras pra frente coletando bullets contiguos.
  const collected: { idx: number; content: string }[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(bulletLineRe);
    if (!m) break;
    const content = m[1].trim();
    if (content.length > MAX_SUGGESTION_LEN) break;
    collected.unshift({ idx: i, content });
    if (collected.length >= MAX_BULLET_EXTRACTION) break;
  }
  if (collected.length < 2) return null;

  // Safeguard: precisa ter "?" nas linhas precedentes (ate 5 linhas acima
  // do primeiro bullet, ignorando linhas vazias). Sem isso, eh provavel
  // que sejam bullets de DADOS (lista de items, nao perguntas).
  const firstBulletIdx = collected[0].idx;
  const lookback = lines.slice(Math.max(0, firstBulletIdx - 5), firstBulletIdx);
  const hasQuestionAbove = lookback.some((l) => l.includes("?"));
  if (!hasQuestionAbove) return null;

  // Sanitiza igual ao canal [[suggestions]]: strip markdown leve.
  const bullets = collected
    .map(({ content }) =>
      content.replace(/\*\*/g, "").replace(/`/g, "").trim(),
    )
    .filter((s) => s.length > 0);
  if (bullets.length < 2) return null;

  const remainingLines = lines.slice(0, firstBulletIdx);
  while (
    remainingLines.length &&
    remainingLines[remainingLines.length - 1].trim() === ""
  )
    remainingLines.pop();
  const message = remainingLines.join("\n").trimEnd();
  return { message, bullets };
}

/**
 * Frases-gatilho de OFERTA de continuacao que nao devem aparecer no corpo da
 * resposta (as sugestoes vivem so nos chips [[suggestions]]). Usado como rede
 * de seguranca caso o modelo escreva a oferta no corpo mesmo proibido no prompt.
 */
const OFFER_TRIGGER_RE =
  /^\s*(se quiser|se preferir|caso queira|caso prefira|posso (te )?(mostrar|listar|detalhar|trazer|exibir|gerar)|tamb[ée]m posso|posso tamb[ée]m|quer que eu|quer ver|deseja que eu|se for util|se quiser que eu)/i;

/**
 * Remove um bloco TRAILING de oferta de continuacao do corpo (a frase-gatilho
 * e os bullets/linhas que a seguem ate o fim). Conservador: so corta quando a
 * oferta esta de fato no final (abaixo dela so ha bullets/linhas vazias). Nao
 * mexe em dados no meio do texto.
 */
export function stripTrailingOffer(message: string): string {
  const lines = message.split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const isBullet = (l: string) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (OFFER_TRIGGER_RE.test(lines[i])) {
      const head = lines.slice(0, i);
      while (head.length && head[head.length - 1].trim() === "") head.pop();
      return head.join("\n").trimEnd();
    }
    // So continua subindo enquanto o que ha abaixo do gatilho for bullet/vazio.
    if (!isBullet(lines[i]) && lines[i].trim() !== "") break;
  }
  return message.trimEnd();
}

/**
 * Extrai sugestões do sufixo `[[suggestions]]:item1|item2|...`.
 * Retorna message sem o sufixo + array de sugestões.
 *
 * Quando o modelo esquece o sufixo, tenta extrair bullet-perguntas
 * trailing (caso de desambiguacao listada inline). Sem nenhum dos dois,
 * cai no FALLBACK_SUGGESTIONS fatiado pelo maxCount.
 */
export function extractSuggestions(
  text: string,
  maxCount?: number,
): {
  message: string;
  suggestions: string[];
} {
  const limit = Math.min(
    Math.max(1, maxCount ?? MAX_SUGGESTIONS),
    MAX_SUGGESTIONS,
  );

  const match = text.match(SUGGESTIONS_RE);
  if (!match) {
    // Modelo esqueceu o canal [[suggestions]]. Antes do fallback generico,
    // tenta extrair bullet-perguntas trailing.
    const extracted = extractBulletQuestions(text);
    if (extracted) {
      return {
        message: extracted.message,
        suggestions: extracted.bullets.slice(0, MAX_BULLET_EXTRACTION),
      };
    }
    return {
      message: stripTrailingOffer(text),
      suggestions: FALLBACK_SUGGESTIONS.slice(0, limit),
    };
  }
  const raw = match[1].trim();
  const parsed = raw
    .split("|")
    .map((s) => s.trim().replace(/\*\*/g, "").replace(/`/g, "").trim())
    .filter((s) => s.length > 0 && s.length <= MAX_SUGGESTION_LEN)
    .slice(0, limit);
  const suggestions =
    parsed.length > 0 ? parsed : FALLBACK_SUGGESTIONS.slice(0, limit);
  let message = text.replace(match[0], "").trimEnd();
  message = message.replace(SUGGESTIONS_GUARD_RE, "").trimEnd();
  message = stripTrailingOffer(message);
  return { message, suggestions };
}

/**
 * Strip defensivo de canal residual. Usar como ultima trava antes de devolver
 * o texto ao usuario, mesmo apos extractSuggestions.
 */
export function stripCanalSuggestionsResidual(text: string): string {
  return text
    .replace(SUGGESTIONS_GUARD_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
