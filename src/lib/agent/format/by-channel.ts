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
        const cells = splitCols(lines[i]);
        const pairs = headers
          .map((h, idx) => {
            const v = cells[idx] ?? "";
            return v ? `${h}: ${v}` : null;
          })
          .filter((x): x is string => x != null);
        out.push(`- ${pairs.join(" | ")}`);
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
