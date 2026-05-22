"use client";

/**
 * AgentMessage — renderiza uma única mensagem no chat do agente.
 *
 * Portado de nexus-insights/src/components/nex/nex-message.tsx.
 * Adaptações:
 * - Renomeação nex→agent; NexMessage→AgentMessage.
 * - AudioPlayer importado de agent/audio-player (Task 3.3c).
 * - Loading bubble: "Agente pensando…" em vez de "Nex está pensando…".
 * - Tool bubble: "Consultou MCP ·" em vez de "Consultou banco ·".
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §4
 */

import { Check, Copy, Database } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "@/components/agent/audio-player";

export type AgentMessageRole = "user" | "assistant" | "tool" | "loading";

export interface AgentMessageProps {
  role: AgentMessageRole;
  content: string;
  /** Para mensagens "tool", nome da função executada. */
  toolName?: string;
  /** "text" (default) ou "audio" — mostra player + transcrição. */
  kind?: "text" | "audio";
  /** URL do blob de áudio gravado (agente-audio-recorder, Task 3.3c). */
  audioBlobUrl?: string | null;
  /** Duração em segundos do áudio. */
  durationSeconds?: number;
  /**
   * Cursor piscante no final — ativo durante streaming.
   * Quando true, adiciona bloco cursor animado ao fim do texto.
   */
  streaming?: boolean;
}

export function AgentMessage({
  role,
  content,
  toolName,
  kind = "text",
  audioBlobUrl,
  durationSeconds,
  streaming = false,
}: AgentMessageProps) {
  if (role === "loading") return <LoadingBubble />;
  if (role === "tool") return <ToolBubble name={toolName ?? "tool"} />;

  const isUser = role === "user";

  // Mensagens de áudio (usuário): player + transcrição
  if (kind === "audio") {
    return (
      <div className="group/msg flex w-full justify-end">
        <div className="relative flex max-w-[85%] flex-col gap-1.5">
          {audioBlobUrl ? (
            <AudioPlayer
              src={audioBlobUrl}
              durationSeconds={durationSeconds}
            />
          ) : (
            <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              (áudio expirado)
            </div>
          )}
          {content && (
            <div className="rounded-2xl bg-violet-600/15 px-3 py-1.5 text-xs text-muted-foreground">
              {content}
            </div>
          )}
          {content && <CopyButton text={content} />}
        </div>
      </div>
    );
  }

  // Mensagens de texto (user + assistant)
  return (
    <div
      className={cn(
        "group/msg flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-violet-600/15 text-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <MarkdownLite content={content} />
        {streaming && content.length > 0 && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-violet-500 align-text-bottom motion-reduce:animate-none"
          />
        )}
        <CopyButton text={content} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-componentes internos                                                    */
/* -------------------------------------------------------------------------- */

function LoadingBubble() {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
        <span className="flex gap-1" aria-hidden="true">
          <Dot delay={0} />
          <Dot delay={0.15} />
          <Dot delay={0.3} />
        </span>
        <span>Agente pensando…</span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500"
      style={{
        animation: "agentDotBounce 1s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function ToolBubble({ name }: { name: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
        <Database className="h-3 w-3" aria-hidden="true" />
        <span>
          Consultou MCP · <span className="font-mono">{name}</span>
        </span>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copiado" : "Copiar mensagem"}
      className={cn(
        "absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity",
        "hover:text-foreground group-hover/msg:opacity-100",
        "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
      style={copied ? { opacity: 1 } : undefined}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Markdown lite (sem dependências externas)                                  */
/* -------------------------------------------------------------------------- */

function MarkdownLite({ content }: { content: string }) {
  const blocks = React.useMemo(() => splitBlocks(content), [content]);
  return (
    <div className="space-y-2 [overflow-wrap:anywhere]">
      {blocks.map((block, i) => {
        if (block.type === "ul") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

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
      listItems.push(listMatch[1]);
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

function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
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
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-violet-600/10 px-1 py-0.5 font-mono text-[0.8em] text-violet-700 dark:text-violet-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
