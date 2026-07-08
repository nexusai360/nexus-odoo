// src/components/agent/gfm-table.ts
// Parser PURO de tabela GFM (pipe table) para o MarkdownLite do Agente Nex.
// Detecta o bloco:
//   | Col A | Col B |
//   |-------|------:|
//   | x     | 10    |
// Retorna o bloco estruturado + o indice da proxima linha nao-consumida.
// Alinhamento vem do separador (:---, ---:, :---:) ou, quando ausente, e inferido
// como "right" para colunas majoritariamente numericas (number-tabular).

export type ColAlign = "left" | "right" | "center" | null;

export interface TableBlock {
  type: "table";
  header: string[];
  align: ColAlign[];
  rows: string[][];
}

/** Uma linha "de tabela" tem ao menos um pipe e algum conteudo. */
function pareceLinhaTabela(line: string): boolean {
  return line.includes("|") && line.trim().replace(/\|/g, "").trim().length >= 0 && /\|/.test(line);
}

/** Linha separadora: so pipes, hifens, dois-pontos e espacos, com ao menos um "---". */
function ehSeparador(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(t);
}

/** Divide "| a | b |" em ["a","b"], tolerando pipes de borda e escapados (\|). */
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "|") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function alignFromSep(cell: string): ColAlign {
  const t = cell.trim();
  const l = t.startsWith(":");
  const r = t.endsWith(":");
  if (l && r) return "center";
  if (r) return "right";
  if (l) return "left";
  return null;
}

const NUM_RE = /^[R$\s]*-?\d{1,3}([.\s]?\d{3})*([.,]\d+)?\s*(mil|[KkMmBb])?\s*%?$/;
function pareceNumero(v: string): boolean {
  const t = v.trim();
  if (t === "" || t === "-") return false;
  return NUM_RE.test(t);
}

/**
 * Tenta parsear uma tabela GFM comecando em lines[start]. Retorna null se nao houver
 * tabela valida (linha de cabecalho seguida de separador).
 */
export function tryParseTable(
  lines: string[],
  start: number,
): { block: TableBlock; next: number } | null {
  const headerLine = lines[start];
  const sepLine = lines[start + 1];
  if (headerLine === undefined || sepLine === undefined) return null;
  if (!pareceLinhaTabela(headerLine) || !ehSeparador(sepLine)) return null;

  const header = splitCells(headerLine);
  const alignSep = splitCells(sepLine).map(alignFromSep);
  const nCols = header.length;

  const rows: string[][] = [];
  let i = start + 2;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || !pareceLinhaTabela(line)) break;
    const cells = splitCells(line);
    // normaliza para nCols (preenche/corta)
    while (cells.length < nCols) cells.push("");
    rows.push(cells.slice(0, nCols));
  }
  if (rows.length === 0) return null;

  // Inferir alinhamento das colunas sem marcacao explicita: right se majoritariamente numerica.
  const align: ColAlign[] = [];
  for (let c = 0; c < nCols; c++) {
    if (alignSep[c]) {
      align.push(alignSep[c]);
      continue;
    }
    const vals = rows.map((r) => r[c] ?? "");
    const naoVazias = vals.filter((v) => v.trim() !== "");
    const numericas = naoVazias.filter(pareceNumero).length;
    align.push(naoVazias.length > 0 && numericas / naoVazias.length >= 0.6 ? "right" : "left");
  }

  return { block: { type: "table", header, align, rows }, next: i };
}
