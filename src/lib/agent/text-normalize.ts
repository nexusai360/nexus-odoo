/**
 * Normalizadores de texto para apresentacao humanizada no Agente Nex.
 * Foco em nomes de produto/parceiro/conta que vem do Odoo em CAIXA ALTA e
 * poluem a tela quando exibidos crus.
 *
 * Regras (regra de raiz, vide pedido do usuario em 2026-05-24 18:58):
 *   - Palavras viram Title Case (primeira letra maiuscula, resto minuscula).
 *   - Codigos/modelos preservam o casing original. Heuristica:
 *       a) Contem digito  -> codigo (TX600, W8000, MEA1500, 1467, 1000102647)
 *       b) Tem 2-5 letras e ZERO vogal (CNYG, PMB)  -> sigla de modelo
 *       c) Esta entre colchetes [1467]  -> codigo, preserva
 *       d) Tem pontuacao tipica de codigo (-, /, :) no meio  -> tratada por
 *          tokens, mas se a palavra inteira parece codigo, preserva.
 *   - Preposicoes em pt-BR ficam minusculas no meio: de, do, da, dos, das,
 *     com, sem, em, para, por, e, ou, a, o, as, os.
 *   - Primeira palavra sempre capitalizada.
 *
 * Modulo puro. Sem dependencia de DB ou env.
 */

const STOPWORDS = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "com",
  "sem",
  "em",
  "para",
  "por",
  "e",
  "ou",
  "a",
  "o",
  "as",
  "os",
  "no",
  "na",
  "nos",
  "nas",
]);

const VOWELS_RE = /[aeiouáéíóúâêîôûãõàèìòù]/i;

// Siglas comuns que nao sao codigos por heuristica (tem vogal) mas devem
// ser preservadas em CAIXA ALTA. Dicionario fechado curto para evitar que
// "Led" fique parecendo nome proprio.
const KNOWN_ACRONYMS = new Set([
  "LED",
  "LCD",
  "USB",
  "GPS",
  "CPU",
  "GPU",
  "PVC",
  "INOX",
  "CNC",
  "NFC",
  "NFE",
  "CNPJ",
  "CPF",
  "ID",
  "PDV",
  "SKU",
  "ERP",
  "CRM",
  "BI",
  "PIB",
  "ICMS",
  "ISS",
  "IPI",
  "PIS",
  "PMB",
]);

// Sufixos societarios e UFs: preservados em CAIXA ALTA mesmo tendo vogal
// (LTDA/ME/EPP/EIRELI/CIA/SA/MEI, e os 27 codigos de UF). Aplicado a CAMPOS DE
// NOME (parceiro/produto/conta) , o risco de colisao com palavra comum (ex.:
// "se") e baixo nesse escopo. F4 Apresentacao, Onda 3.1.
const PRESERVA_MAIUSCULA = new Set([
  // sufixos societarios
  "LTDA",
  "ME",
  "EPP",
  "EIRELI",
  "MEI",
  "CIA",
  "SA",
  // UFs (codigo de 2 letras)
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

function isCodeLike(word: string): boolean {
  if (word.length === 0) return false;
  // Codigo entre colchetes: [1467]
  if (/^\[.+\]$/.test(word)) return true;
  // Contem digito: TX600, W8000, 1467, T600X, 1X1, 16MM
  if (/\d/.test(word)) return true;
  // Sigla sem vogal nenhuma e com >=2 chars: CNYG, MX, NF, PMB
  if (word.length >= 2 && !VOWELS_RE.test(word)) return true;
  // Sigla conhecida (dicionario fechado).
  if (KNOWN_ACRONYMS.has(word.toUpperCase())) return true;
  return false;
}

function capitalizeWord(word: string, isFirst: boolean): string {
  if (word.length === 0) return word;
  // Sufixo societario / UF: forca CAIXA ALTA mesmo que tenha vogal ou venha
  // em minuscula no input (vem antes do stopword/codigo).
  if (PRESERVA_MAIUSCULA.has(word.toUpperCase())) return word.toUpperCase();
  if (isCodeLike(word)) return word; // preserva codigos
  const lower = word.toLowerCase();
  if (!isFirst && STOPWORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Humaniza um nome cru vindo do Odoo. Mantem pontuacao, hifens e separadores.
 * Cada token alfanumerico passa pelo capitalizeWord.
 *
 * Exemplos:
 *   "MOLA ESPIRAL EM ACO"                  -> "Mola Espiral em Aco"
 *   "MOLA ESPIRAL EM AÇO CROMADO - 1000097424"
 *     -> "Mola Espiral em Aço Cromado - 1000097424"
 *   "[1467] CABO DE AÇO - CNYG186X19APR009"
 *     -> "[1467] Cabo de Aço - CNYG186X19APR009"
 *   "T600X ESTEIRA C/ INCL. ELETRICA E PROG. MATRIX"
 *     -> "T600X Esteira c/ Incl. Eletrica e Prog. Matrix"
 *   "PAINEL LED MX (LED-C)"
 *     -> "Painel LED MX (LED-C)"
 */
export function humanizeName(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  // Tokeniza preservando os separadores (espacos, pontuacao). Cada elemento
  // resultante alterna entre palavras alfanumericas e separadores.
  const parts = raw.split(/([^\p{L}\p{N}]+)/u);
  let wordIdx = 0;
  const humanizado = parts
    .map((part) => {
      if (part.length === 0) return part;
      if (/^[^\p{L}\p{N}]+$/u.test(part)) return part; // separador
      const out = capitalizeWord(part, wordIdx === 0);
      wordIdx += 1;
      return out;
    })
    .join("");
  // Sufixo societario "S.A." / "S/A": tokens de 1 letra nao passam pelo set;
  // corrige no final preservando o separador (ponto ou barra).
  return humanizado.replace(/\bS\s*([./])\s*a\b\.?/gi, (_m, sep: string) =>
    sep === "." ? "S.A." : "S/A",
  );
}
