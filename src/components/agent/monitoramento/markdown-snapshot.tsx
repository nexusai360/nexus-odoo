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
import { cn } from "@/lib/utils";
import { tryParseTable, type TableBlock, type ColAlign } from "@/components/agent/gfm-table";

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] } | TableBlock;

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

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx] ?? "";
    const tbl = tryParseTable(lines, idx);
    if (tbl) {
      flushParagraph();
      flushList();
      blocks.push(tbl.block);
      idx = tbl.next - 1;
      continue;
    }
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

function snapAlign(a: ColAlign): string {
  return a === "right"
    ? "text-right tabular-nums"
    : a === "center"
      ? "text-center"
      : "text-left";
}

function SnapshotTable({ block }: { block: TableBlock }) {
  return (
    <div className="my-1 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[0.8rem]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {block.header.map((h, i) => (
              <th
                key={i}
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-semibold text-foreground",
                  snapAlign(block.align[i] ?? null),
                )}
              >
                {renderInline(protectValues(h))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {block.rows.map((row, r) => (
            <tr key={r} className="odd:bg-muted/20">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "px-3 py-1.5 align-top text-foreground/90",
                    snapAlign(block.align[c] ?? null),
                  )}
                >
                  {renderInline(protectValues(cell))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownSnapshot({ content }: { content: string }) {
  const blocks = useMemo(() => splitBlocks(content), [content]);
  return (
    // break-word (nao 'anywhere'): quebra nos espacos e so racha uma palavra
    // se ela sozinha estourar a linha; numeros/codigos curtos ficam inteiros.
    <div className="space-y-2 text-sm [overflow-wrap:break-word]">
      {blocks.map((block, i) => {
        if (block.type === "table") {
          return <SnapshotTable key={i} block={block} />;
        }
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
