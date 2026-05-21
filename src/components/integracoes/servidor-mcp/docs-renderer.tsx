"use client";

/**
 * McpDocsRenderer — renderiza markdown como HTML estilizado, no padrão visual
 * da documentação de API do NFE Nexus.
 *
 * Parser inline simples (sem dependência de MDX/react-markdown):
 * headings, bold, itálico, inline code, fenced code blocks com botão copiar,
 * tabelas, listas, regras horizontais, blockquotes (callout) e parágrafos.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Inline parser
// ──────────────────────────────────────────────────────────────────────────────

function parseInline(text: string): string {
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">$1</code>',
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-violet-500 underline underline-offset-2 hover:no-underline" target="_blank" rel="noopener noreferrer">$1</a>',
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

    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

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

    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1].match(/^\|[-| :]+\|$/)) {
      const header = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      i += 2;
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

    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: false });
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s(.+)$/);
    if (olMatch) {
      const items: string[] = [];
      const startNum = parseInt(olMatch[1], 10);
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s(.+)$/);
        if (!m) break;
        items.push(m[2]);
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: true, startNum });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

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
// CodeBlock — bloco de código com rótulo de linguagem e botão copiar
// ──────────────────────────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  bash: "Shell",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  http: "HTTP",
  text: "Texto",
};

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const label = LANG_LABELS[lang.toLowerCase()] ?? (lang || "Código");

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success("Código copiado");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar código"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted/30 p-4 text-xs font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Block renderer
// ──────────────────────────────────────────────────────────────────────────────

function renderBlock(block: Block, idx: number): React.ReactElement {
  switch (block.type) {
    case "heading": {
      const classes: Record<number, string> = {
        1: "text-base font-semibold text-foreground mt-8 mb-3 first:mt-0",
        2: "text-sm font-semibold text-foreground mt-6 mb-2",
        3: "text-[13px] font-semibold text-foreground mt-4 mb-2",
        4: "text-xs font-semibold text-muted-foreground mt-3 mb-1 uppercase tracking-wide",
      };
      const Tag = `h${block.level ?? 1}` as "h1" | "h2" | "h3" | "h4";
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
      return <CodeBlock key={idx} code={block.content} lang={block.lang ?? ""} />;

    case "hr":
      return <hr key={idx} className="border-border my-4" />;

    case "blockquote":
      return (
        <div
          key={idx}
          className="rounded-lg border-l-2 border-violet-500/50 bg-violet-500/5 px-4 py-3"
        >
          <p
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: parseInline(block.content) }}
          />
        </div>
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
                <tr
                  key={ri}
                  className={cn(
                    "border-b border-border last:border-0",
                    ri % 2 === 0 ? "" : "bg-muted/20",
                  )}
                >
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
          <ol key={idx} className="list-decimal list-outside ml-5 space-y-1" start={block.startNum}>
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
        <ul key={idx} className="list-disc list-outside ml-5 space-y-1">
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
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </article>
  );
}
