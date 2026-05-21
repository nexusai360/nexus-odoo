"use client";

/**
 * McpDocsRenderer — renderiza markdown como HTML estilizado.
 *
 * Decisão MDX: o projeto não tem setup MDX nem react-markdown instalados.
 * Para não adicionar dependência pesada, usamos um parser simples inline:
 * - headings (# ## ###)
 * - bold (**text**)
 * - inline code (`code`)
 * - fenced code blocks (``` ... ```)
 * - tables (| col | col |)
 * - unordered lists (- item)
 * - ordered lists (1. item)
 * - horizontal rules (---)
 * - blockquotes (> text)
 * - paragraphs
 *
 * Suficiente para o conteúdo dos docs do MCP sem dep extra.
 */

import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Inline parser
// ──────────────────────────────────────────────────────────────────────────────

function parseInline(text: string): string {
  // Escape HTML first
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic *text*
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code `code`
  s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-2 hover:no-underline" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// Block parser
// ──────────────────────────────────────────────────────────────────────────────

interface Block {
  type: string;
  content: string;
  level?: number;
  lang?: string;
  rows?: string[][];
  header?: string[];
  items?: string[];
  ordered?: boolean;
  startNum?: number;
}

function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // Table (starts with | and has header separator on next line)
    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1].match(/^\|[-| :]+\|$/)) {
      const header = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      i += 2; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(
          lines[i]
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim()),
        );
        i++;
      }
      blocks.push({ type: "table", content: "", header, rows });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: false });
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s(.+)$/);
    if (olMatch) {
      const items: string[] = [];
      let startNum = parseInt(olMatch[1], 10);
      let matchNum = startNum;
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s(.+)$/);
        if (!m) break;
        items.push(m[2]);
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: true, startNum });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty non-special lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("|") &&
      !lines[i].startsWith("> ") &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", content: paraLines.join(" ") });
  }

  return blocks;
}

// ──────────────────────────────────────────────────────────────────────────────
// Block renderer
// ──────────────────────────────────────────────────────────────────────────────

function renderBlock(block: Block, idx: number): React.ReactElement {
  switch (block.type) {
    case "heading": {
      const classes: Record<number, string> = {
        1: "text-xl font-bold text-foreground mt-8 mb-4 first:mt-0",
        2: "text-base font-semibold text-foreground mt-6 mb-3",
        3: "text-sm font-semibold text-foreground mt-4 mb-2",
        4: "text-xs font-semibold text-muted-foreground mt-3 mb-1 uppercase tracking-wide",
      };
      const Tag = (`h${block.level ?? 1}`) as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag
          key={idx}
          className={classes[block.level ?? 1]}
          dangerouslySetInnerHTML={{ __html: parseInline(block.content) }}
        />
      );
    }

    case "paragraph":
      return (
        <p
          key={idx}
          className="text-sm text-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parseInline(block.content) }}
        />
      );

    case "code":
      return (
        <pre
          key={idx}
          className="bg-muted/60 border border-border rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed"
        >
          <code>{block.content}</code>
        </pre>
      );

    case "hr":
      return <hr key={idx} className="border-border my-4" />;

    case "blockquote":
      return (
        <blockquote
          key={idx}
          className="border-l-2 border-primary/40 pl-4 py-1 bg-muted/30 rounded-r-lg"
        >
          <p
            className="text-sm text-muted-foreground italic"
            dangerouslySetInnerHTML={{ __html: parseInline(block.content) }}
          />
        </blockquote>
      );

    case "table": {
      const header = block.header ?? [];
      const rows = block.rows ?? [];
      return (
        <div key={idx} className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: parseInline(h) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={cn("border-b border-border last:border-0", ri % 2 === 0 ? "" : "bg-muted/20")}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 text-foreground"
                      dangerouslySetInnerHTML={{ __html: parseInline(cell) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "list": {
      const items = block.items ?? [];
      if (block.ordered) {
        return (
          <ol key={idx} className="list-decimal list-inside space-y-1" start={block.startNum}>
            {items.map((item, ii) => (
              <li
                key={ii}
                className="text-sm text-foreground leading-relaxed pl-1"
                dangerouslySetInnerHTML={{ __html: parseInline(item) }}
              />
            ))}
          </ol>
        );
      }
      return (
        <ul key={idx} className="list-disc list-inside space-y-1">
          {items.map((item, ii) => (
            <li
              key={ii}
              className="text-sm text-foreground leading-relaxed pl-1"
              dangerouslySetInnerHTML={{ __html: parseInline(item) }}
            />
          ))}
        </ul>
      );
    }

    default:
      return <div key={idx} />;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  content: string;
  className?: string;
}

export function McpDocsRenderer({ content, className }: Props) {
  const blocks = parseMarkdown(content);

  return (
    <article className={cn("space-y-4", className)}>
      <style>{`
        .inline-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.75rem;
          background-color: hsl(var(--muted) / 0.6);
          border: 1px solid hsl(var(--border));
          border-radius: 0.25rem;
          padding: 0.1em 0.35em;
        }
      `}</style>
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </article>
  );
}
