/**
 * Formatter de saida por canal. O orquestrador do agente e headless e
 * produz markdown gfm padrao; cada canal interpreta para o seu meio.
 *
 * - bubble  : passa direto (UI renderiza markdown rico via AgentMarkdown).
 * - whatsapp: converte para a sintaxe propria do WhatsApp (*bold*, _italic_,
 *             ~strike~, tabelas viram listas hifenizadas, links viram
 *             "texto: url"). O conflito entre markdown italico (*x*) e
 *             WhatsApp bold (*x*) e resolvido com placeholder em duas etapas.
 *
 * Modulo puro, sem efeitos colaterais; safe para client ou server.
 */

const BOLD_TOKEN_OPEN = "BOLD_OPEN";
const BOLD_TOKEN_CLOSE = "BOLD_CLOSE";

export type AgentChannel = "bubble" | "whatsapp";

export function formatForChannel(content: string, channel: AgentChannel): string {
  if (channel === "bubble") return content;
  return toWhatsApp(content);
}

function toWhatsApp(content: string): string {
  let r = content;

  // 1. Proteger **bold** com placeholders pareados para nao colidir com
  //    a conversao de italic. Inline only (sem quebrar paragrafo).
  r = r.replace(
    /\*\*([^*\n]+?)\*\*/g,
    (_, t: string) => `${BOLD_TOKEN_OPEN}${t}${BOLD_TOKEN_CLOSE}`,
  );

  // 2. *italic* -> _italic_ (markdown italico = WhatsApp italico).
  r = r.replace(/\*([^*\n]+?)\*/g, "_$1_");

  // 3. ~~strike~~ -> ~strike~
  r = r.replace(/~~([^~\n]+?)~~/g, "~$1~");

  // 4. Restaurar bold como *x* (sintaxe WhatsApp).
  r = r.replaceAll(BOLD_TOKEN_OPEN, "*").replaceAll(BOLD_TOKEN_CLOSE, "*");

  // 5. Links markdown [texto](url) -> "texto: url"
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");

  // 6. Tabelas markdown -> lista hifenizada. Detecta blocos com cabecalho +
  //    separador e converte cada linha em "- col1: val1 | col2: val2 ...".
  r = convertTablesToList(r);

  // 7. Reduz multiplas linhas em branco (mais de 2) para 2.
  r = r.replace(/\n{3,}/g, "\n\n");

  return r.trim();
}

// ─── Formatação compacta para mobile (SPEC §3.12) ───────────────────────────
// A garantia é determinística e vive AQUI: o prompt do agente não muda.

/** Teto de colunas aproveitadas por linha; as demais são descartadas. */
const MAX_COLUNAS_POR_LINHA = 4;

/**
 * Mapa explícito de rótulos compactos. Cabeçalho fora do mapa entra truncado
 * em 8 caracteres. A chave é o cabeçalho normalizado (minúsculas, sem espaço
 * nas pontas).
 */
const ROTULOS_COMPACTOS: Record<string, string> = {
  notas: "NF",
  "notas fiscais": "NF",
  quantidade: "Qtd",
  documento: "Doc",
  documentos: "Doc",
  filial: "Filial",
  vendedor: "Vend",
  produtos: "Prod",
};

const MOEDA_RE = /^-?\s*R\$\s*\d{1,3}(\.\d{3})*(,\d{2})?$/;
const NUMERO_RE = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;
const PERCENTUAL_RE = /^-?\d+(,\d+)?%$/;

export type ClasseDeCelula = "moeda" | "numero" | "texto";

/**
 * Classifica uma célula da tabela (SPEC §3.12, nesta ordem): moeda → número →
 * texto. `1.2.3`, `,,,`, `.` e `R$` sozinho são texto.
 */
export function classificarCelula(valor: string): ClasseDeCelula {
  const v = valor.trim();
  if (MOEDA_RE.test(v)) return "moeda";
  if (NUMERO_RE.test(v) || PERCENTUAL_RE.test(v)) return "numero";
  return "texto";
}

/** Título com letra é NOME (vai sem rótulo); sem letra nenhuma é CÓDIGO (leva o rótulo). */
const TEM_LETRA_RE = /[A-Za-zÀ-ÿ]/;

const TRUNCAR_TEXTO_EM = 24;

/** Truncamento só incide em TEXTO, nunca em moeda ou número. */
function truncarTexto(valor: string): string {
  return valor.length > TRUNCAR_TEXTO_EM
    ? `${valor.slice(0, TRUNCAR_TEXTO_EM)}...`
    : valor;
}

function rotuloDe(header: string): string {
  const chave = header.trim().toLowerCase();
  return ROTULOS_COMPACTOS[chave] ?? header.trim().slice(0, 8);
}

/**
 * Converte UMA linha da tabela em UMA linha da lista compacta:
 * 1. título = primeira coluna não vazia, sem rótulo (linha toda vazia sai);
 * 2. moeda entra sem rótulo; número como `(valor RÓTULO)`; texto como
 *    `(RÓTULO valor)`;
 * 3. células vazias são omitidas; teto de MAX_COLUNAS_POR_LINHA colunas.
 */
function linhaCompacta(headers: string[], cells: string[]): string | null {
  const colunas = headers
    .map((h, idx) => ({ header: h, valor: (cells[idx] ?? "").trim() }))
    .slice(0, MAX_COLUNAS_POR_LINHA)
    .filter((c) => c.valor !== "");
  if (colunas.length === 0) return null;

  const [titulo, ...resto] = colunas;
  // O título vai SEM rótulo quando é um NOME (cliente, produto): ele se explica sozinho.
  // Quando é um CÓDIGO , sem nenhuma letra: "5102", "12345", "1.234,00" , não: um número
  // pelado no começo da linha não diz nada a quem lê no WhatsApp. Aí ele leva o rótulo da
  // coluna junto ("CFOP 5102", "Nota 12345"). Dívida da SPEC §3.12, fechada em 2026-07-13.
  //
  // O critério é "tem letra?", e não a classificação de célula: `classificarCelula` só
  // reconhece número no formato pt-BR com separador de milhar, então um CFOP como "5102"
  // cai em "texto" e escaparia da regra.
  const tituloEhCodigo = !TEM_LETRA_RE.test(titulo.valor);
  const partes: string[] = [
    tituloEhCodigo
      ? `${rotuloDe(titulo.header)} ${titulo.valor}`
      : truncarTexto(titulo.valor),
  ];

  for (const c of resto) {
    const classe = classificarCelula(c.valor);
    if (classe === "moeda") {
      partes.push(c.valor);
    } else if (classe === "numero") {
      partes.push(`(${c.valor} ${rotuloDe(c.header)})`);
    } else {
      partes.push(`(${rotuloDe(c.header)} ${truncarTexto(c.valor)})`);
    }
  }

  return `- ${partes.join(" ")}`;
}

function convertTablesToList(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const headerLine = lines[i];
    const sepLine = lines[i + 1];
    if (
      headerLine &&
      sepLine &&
      headerLine.includes("|") &&
      /^\s*\|?[\s\-:|]+\|[\s\-:|]+\|?\s*$/.test(sepLine)
    ) {
      const headers = splitCols(headerLine);
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        const linha = linhaCompacta(headers, splitCols(lines[i]));
        if (linha !== null) out.push(linha);
        i += 1;
      }
    } else {
      out.push(headerLine);
      i += 1;
    }
  }
  return out.join("\n");
}

function splitCols(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === ""));
}
