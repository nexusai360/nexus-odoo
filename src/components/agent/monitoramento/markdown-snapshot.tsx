"use client";

/**
 * MarkdownSnapshot , renderer markdown leve para snapshots de pergunta e
 * resposta no drill-down /agente/monitoramento. Espelha a logica da
 * MarkdownLite da bubble (agent-message.tsx), porem como componente
 * isolado para nao acoplar a area de UI do agente-message (em uso por
 * outros agentes paralelos).
 *
 * Suporta:
 *   - paragrafos com \n preservado
 *   - listas com `-` ou `*` no inicio
 *   - **bold** -> <strong>
 *   - `code inline` -> <code>
 */

import { Fragment, useMemo, type ReactNode } from "react";

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

// Mantem valores e unidades coladas (NBSP) para a quebra de linha cair sempre
// nos espacos do NOME, nunca no meio de um valor. Ex.: "R$ 3.404,00" e
// "19 un." viram tokens inquebáveis; ja "Esteira Matrix Fitness" quebra
// normalmente nos espacos. O numero em si (504.164,92) nao tem espaco, entao
// com overflow-wrap:break-word nunca racha no meio.
const NBSP = " ";
function protectValues(text: string): string {
  return text
    .replace(/R\$\s+(?=\d)/g, `R$${NBSP}`)
    .replace(/(\d)\s+(un\.?|unidades?)\b/gi, `$1${NBSP}$2`);
}

function splitBlocks(input: string): Block[] {
  const lines = input.split(/\r?\n/);
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let listItems: string[] | null = null;

  const flushParagraph = () => {
    if (buffer.length) {
      blocks.push({ type: "p", text: buffer.join("\n") });
      buffer = [];
    }
  };
  const flushList = () => {
    if (listItems && listItems.length) {
      blocks.push({ type: "ul", items: listItems });
    }
    listItems = null;
  };

  for (const raw of lines) {
    const listMatch = raw.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(listMatch[1] ?? "");
      continue;
    }
    if (raw.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    buffer.push(raw);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  // **bold** | _italic_ | *italic* | `code`
  const regex = /(\*\*[^*]+\*\*|_[^_\n]+_|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-violet-600/10 px-1 py-0.5 font-mono text-[0.85em] text-violet-700 dark:text-violet-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // italic _t_ ou *t*
      nodes.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownSnapshot({ content }: { content: string }) {
  const blocks = useMemo(() => splitBlocks(content), [content]);
  return (
    // break-word (nao 'anywhere'): quebra nos espacos e so racha uma palavra
    // se ela sozinha estourar a linha; numeros/codigos curtos ficam inteiros.
    <div className="space-y-2 text-sm [overflow-wrap:break-word]">
      {blocks.map((block, i) => {
        if (block.type === "ul") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(protectValues(item))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            <Fragment>{renderInline(protectValues(block.text))}</Fragment>
          </p>
        );
      })}
    </div>
  );
}
