/**
 * Extrai o(s) número(s) de referência do pedido no Mercos (CRM de vendas externo) do texto
 * livre `obs` do pedido do Odoo. A FONTE DA VERDADE é o texto do Odoo; esta função só o
 * estrutura. Formato real (medido no cache): "PEDIDO MERCOS: NNNNN", 4-6 dígitos, às vezes
 * com erro de digitação no rótulo, rótulo alternativo ("Pedido Nº"), ou vários números.
 *
 * Estratégia (em vez de um regex único):
 *  1. Âncora de rótulo tolerante a erro , acha uma palavra "parecida com MERCOS" por
 *     distância de Damerau-Levenshtein <= 2 (cobre MERVCOS, MECROS, MERCOSS...). Guardas:
 *     nunca casa MERCOSUL (bloqueio explícito, como antes); o número tem que vir logo após
 *     (só ": ", espaço, "nº" no meio), na MESMA linha (não atravessa `\n`).
 *  2. Cadeia de múltiplos números , do rótulo, pega o 1º número no formato Mercos (4-6
 *     dígitos puros) e segue pegando os próximos enquanto houver só um separador entre eles
 *     (`|  -  ,  /  ;` ou espaço). Uma PALAVRA quebra a cadeia (protege "...AO PEDIDO NNN" e
 *     "N PALETE CONTEM NN VOLUMES").
 *  3. Fallback "Pedido Nº" , só quando NÃO há rótulo Mercos em lugar nenhum do texto.
 *
 * Risco residual conhecido (aceito): uma palavra rara como "comércios NNNNN" fica a distância
 * 1 de "mercos" (pelo plural) e seria casada; não ocorre no dado real (conferido em toda a
 * base). O guarda que de fato importa é o de MERCOSUL, tratado explicitamente.
 */

/** Distância de Damerau-Levenshtein de `pattern` contra QUALQUER substring de `text`. */
function fuzzySubstringDistance(pattern: string, text: string): number {
  const m = pattern.length;
  const n = text.length;
  if (m === 0) return 0;
  if (n === 0) return m;
  let prev2: number[] = [];
  // linha i=0: início livre em qualquer posição do texto (tudo zero).
  let prev: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = new Array(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        pattern[i - 1] === text[j - 2] &&
        pattern[i - 2] === text[j - 1]
      ) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
    }
    prev2 = prev;
    prev = cur;
  }
  // fim livre: melhor casamento termina em qualquer posição.
  return Math.min(...prev);
}

/** A palavra é um rótulo "Mercos" (tolerando typo), sem ser "Mercosul"? */
function ehRotuloMercos(palavra: string): boolean {
  const w = palavra.toLowerCase();
  const dMercos = fuzzySubstringDistance("mercos", w);
  if (dMercos > 2) return false;
  // Se casa MERCOSUL igual ou melhor, é Mercosul (bloco econômico), não o CRM.
  const dMercosul = fuzzySubstringDistance("mercosul", w);
  if (dMercosul <= dMercos) return false;
  return true;
}

// Palavra (>=3 letras) seguida, com um pequeno vão de separadores (sem letras, sem `\n`), de
// um número no formato Mercos (4-6 dígitos puros, isolado de outros dígitos).
const RE_ANCORA = /([A-Za-zÀ-ÿ]{3,})[^0-9A-Za-zÀ-ÿ\n]{0,6}(?<![0-9])(\d{4,6})(?![0-9])/g;

// Próximo número da cadeia: no máximo um separador entre os números.
const RE_PROXIMO = /^[ \t]*[|,/;\-]?[ \t]*(?<![0-9])(\d{4,6})(?![0-9])/;

// Fallback: "Pedido Nº NNNNN" (aceita Nº/N°/No/Numero, com ou sem pontuação).
const RE_PEDIDO_NUM = /\bpedido\s*(?:n[º°ªo]?\.?|numero|n\.?º?)?\s*[:#-]?\s*(?<![0-9])(\d{4,6})(?![0-9])/i;

// Fallback final: uma linha cujo conteúdo é SÓ um número de EXATAMENTE 5 dígitos (opcionalmente
// prefixado por nº/#/:) é considerada o número do Mercos. 4 ou 6+ dígitos não contam, e um
// número de 5 dígitos no meio de texto (CEP, nº de rua) NÃO conta , tem que ser a linha inteira.
const RE_NUM_ISOLADO = /^(?:n[º°ªo]?\.?\s*|#\s*|:\s*)?(\d{5})$/i;

function dedup(nums: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nums) {
    if (!vistos.has(n)) {
      vistos.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Coleta a cadeia de números Mercos de UMA linha, a partir da primeira âncora válida. */
function cadeiaMercosNaLinha(linha: string): string[] {
  RE_ANCORA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ANCORA.exec(linha)) !== null) {
    if (!ehRotuloMercos(m[1])) continue;
    const nums = [m[2]];
    let resto = linha.slice(m.index + m[0].length);
    let prox: RegExpExecArray | null;
    while ((prox = RE_PROXIMO.exec(resto)) !== null) {
      nums.push(prox[1]);
      resto = resto.slice(prox[0].length);
    }
    return dedup(nums);
  }
  return [];
}

/** Lista de números de Mercos referenciados na observação (ordenada, deduplicada). */
export function extrairNumerosMercos(obs: string | null | undefined): string[] {
  if (!obs) return [];
  const linhas = obs.split("\n");
  // 1) rótulo Mercos (com typo) tem prioridade sobre o fallback.
  for (const linha of linhas) {
    const nums = cadeiaMercosNaLinha(linha);
    if (nums.length) return nums;
  }
  // 2) fallback "Pedido Nº", só quando NÃO há rótulo Mercos em nenhuma linha.
  for (const linha of linhas) {
    const f = RE_PEDIDO_NUM.exec(linha);
    if (f) return [f[1]];
  }
  // 3) fallback final: uma linha que é só um número de exatamente 5 dígitos.
  for (const linha of linhas) {
    const m = RE_NUM_ISOLADO.exec(linha.trim());
    if (m) return [m[1]];
  }
  return [];
}

/**
 * Compatibilidade / display: os números unidos por ", " (ex.: "48524, 48529"), ou null.
 * É o valor exibido na coluna "Nº Mercos" do B-09.
 */
export function extrairNumeroMercos(obs: string | null | undefined): string | null {
  const nums = extrairNumerosMercos(obs);
  return nums.length ? nums.join(", ") : null;
}
