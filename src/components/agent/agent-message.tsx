"use client";

/**
 * AgentMessage , renderiza uma única mensagem no chat do agente.
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

import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Loader2,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AudioPlayer } from "@/components/agent/audio-player";
import type { ProgressStep } from "./progress-trail";
import { formatRelativeDateTime } from "@/lib/format-datetime-relative";

export type AgentMessageRole = "user" | "assistant" | "tool" | "loading";

export interface AgentMessageProps {
  role: AgentMessageRole;
  content: string;
  /** Para mensagens "tool", nome da função executada. */
  toolName?: string;
  /** "text" (default) ou "audio", mostra player + transcrição. */
  kind?: "text" | "audio";
  /** URL do blob de áudio gravado (agente-audio-recorder, Task 3.3c). */
  audioBlobUrl?: string | null;
  /** Duração em segundos do áudio. */
  durationSeconds?: number;
  /**
   * Cursor piscante no final, ativo durante streaming.
   * Quando true, adiciona bloco cursor animado ao fim do texto.
   */
  streaming?: boolean;
  /**
   * Trilha de pensamento absorvida na bolha do assistente (Onda C do
   * Renascimento). Quando presente, renderiza header colapsável acima do
   * conteúdo da mensagem com o resumo das tools consultadas.
   */
  steps?: import("./progress-trail").ProgressStep[];
  /** Trilha começa colapsada (default após `done`). */
  stepsCollapsed?: boolean;
  /** Callback de toggle do chevron da trilha. */
  onToggleSteps?: () => void;
  /** Duração total do turno em ms para o resumo da trilha colapsada. */
  durationMs?: number;
  /** Timestamp de envio para exibir no rodapé da bolha. Quando ausente,
   *  o rodapé fica oculto (histórico legado sem stamp). */
  createdAt?: string | Date | null;
}

export function AgentMessage({
  role,
  content,
  toolName,
  kind = "text",
  audioBlobUrl,
  durationSeconds,
  streaming = false,
  steps,
  stepsCollapsed = true,
  onToggleSteps,
  durationMs,
  createdAt,
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
  // Trilha aparece desde o instante do send (placeholder "Pensando..." com
  // dots), continua mostrando steps conforme chegam, e fica como header
  // colapsavel "Raciocinio" apos done. So nao aparece quando NAO ha steps
  // E nao esta streaming (caso de mensagem antiga sem trilha).
  const showTrail =
    !isUser && (streaming || (Array.isArray(steps) && steps.length > 0));
  return (
    <BubbleWrapper isUser={isUser}>
      <BubbleSurface isUser={isUser}>
        {showTrail ? (
          <AssistantTrailBlock
            steps={steps ?? []}
            streaming={streaming}
            collapsed={stepsCollapsed}
            onToggle={onToggleSteps}
            durationMs={durationMs}
          />
        ) : null}
        <AssistantBodyReveal hasContent={content.length > 0}>
          {streaming ? (
            <StreamingText content={content} />
          ) : (
            <MarkdownLite content={content} />
          )}
          {streaming && content.length > 0 && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-violet-500 align-text-bottom motion-reduce:animate-none"
            />
          )}
        </AssistantBodyReveal>
        {createdAt && !streaming ? (
          <div
            className={cn(
              "mt-1 text-[10px] tabular-nums text-muted-foreground/70",
              isUser ? "text-right" : "text-left",
            )}
            suppressHydrationWarning
          >
            {formatRelativeDateTime(createdAt)}
          </div>
        ) : null}
        <CopyButton text={content} />
      </BubbleSurface>
    </BubbleWrapper>
  );
}

// Inner bubble com layout="size": cresce suave conforme trilha colapsa e
// texto streama em paralelo. Sem layout, o container saltava entre alturas
// a cada token chegando; com layout, a interpolacao do framer-motion deixa
// o "container que vai se formando" pedido pelo usuario.
function BubbleSurface({
  isUser,
  children,
}: {
  isUser: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={!reduce ? "size" : false}
      transition={
        reduce
          ? { duration: 0 }
          : { layout: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }
      }
      className={cn(
        "relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        isUser
          ? "bg-violet-600/15 text-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {children}
    </motion.div>
  );
}

// Wrapper com motion: opacity 0->1 com duration longa e easing suave.
// Sem scale, sem slide brusco (feedback 2026-05-24: "brota grosseiramente,
// chega assusta"). Container layout=true anima crescimento de altura quando
// trail ganha steps ou content cresce, sem pulos. Respeita reduce-motion.
function BubbleWrapper({
  isUser,
  children,
}: {
  isUser: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={!reduce ? "position" : false}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : { opacity: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
      }
      // group/msg restaurado: CopyButton interno usa group-hover/msg para
      // aparecer no hover. Perdi a classe ao trocar o div pelo motion.div.
      className={cn(
        "group/msg flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Trilha absorvida na bolha do assistente                                    */
/* -------------------------------------------------------------------------- */

function AssistantTrailBlock({
  steps,
  streaming,
  collapsed,
  onToggle,
  durationMs,
}: {
  steps: ProgressStep[];
  streaming: boolean;
  collapsed: boolean;
  onToggle?: () => void;
  durationMs?: number;
}) {
  const reduce = useReducedMotion();
  const total = steps.length;
  const running = steps.some((s) => s.state === "running");
  const durationLabel =
    typeof durationMs === "number" && durationMs > 0
      ? ` · ${(durationMs / 1000).toFixed(1)}s`
      : "";
  const headerLabel =
    streaming || running
      ? "Pensando"
      : `Raciocínio · ${total}${total === 1 ? " etapa" : " etapas"}${durationLabel}`;
  const expanded = streaming || !collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const showThinking = streaming || running;
  const EASE = [0.16, 1, 0.3, 1] as const;

  return (
    <motion.div
      layout={!reduce ? "size" : false}
      transition={
        reduce ? { duration: 0 } : { layout: { duration: 0.5, ease: EASE } }
      }
      className="mb-2"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-expanded={expanded}
        aria-controls="agent-trail-list"
        className={cn(
          "flex w-full items-center gap-2 text-left text-xs font-medium",
          "text-foreground/85 transition-colors",
          onToggle
            ? "cursor-pointer hover:text-foreground"
            : "cursor-default",
        )}
      >
        <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <AnimatePresence initial={false} mode="wait">
            {showThinking ? (
              <motion.span
                key="icon-thinking"
                initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: 8 }}
                transition={reduce ? { duration: 0 } : { duration: 0.32, ease: EASE }}
                className="absolute inset-0 inline-flex items-center justify-center"
                aria-hidden
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              </motion.span>
            ) : (
              <motion.span
                key="icon-done"
                initial={reduce ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={reduce ? { duration: 0 } : { duration: 0.32, ease: EASE }}
                className="absolute inset-0 inline-flex items-center justify-center"
                aria-hidden
              >
                <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="relative flex-1">
          <AnimatePresence initial={false}>
            <motion.span
              key={showThinking ? "label-thinking" : "label-done"}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.18, ease: EASE }
              }
              className="absolute inset-0 block truncate"
            >
              {showThinking ? <ShimmerText text={headerLabel} /> : headerLabel}
            </motion.span>
            <span className="invisible block truncate" aria-hidden>
              {headerLabel}
            </span>
          </AnimatePresence>
        </span>
      </button>
      {/* Expand/collapse via CSS grid trick (grid-template-rows 0fr -> 1fr).
          Duracao 500ms com easing expo-out + opacity 250ms (sai mais rapido
          que altura): sensacao de "recolhimento" puxando para o header, em
          vez de simplesmente sumir. Steps internos ganham translate-y -4
          quando colapsado para reforcar o recoil visual. */}
      <div
        className={cn(
          "grid motion-reduce:transition-none",
          "transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          expanded
            ? "grid-rows-[1fr] opacity-100 delay-0"
            : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!expanded}
      >
        <div
          className={cn(
            "overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "motion-reduce:transition-none",
            expanded ? "translate-y-0" : "-translate-y-1",
          )}
        >
          <ul
            id="agent-trail-list"
            aria-live={streaming ? "polite" : undefined}
            className="mt-1 flex flex-col gap-0.5 pl-5"
          >
            <AnimatePresence initial={false}>
              {steps.map((s) => (
                <motion.li
                  key={s.id}
                  initial={
                    reduce ? false : { opacity: 0, y: -6, filter: "blur(2px)" }
                  }
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6, filter: "blur(2px)" }
                  }
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          duration: 0.4,
                          ease: EASE,
                          filter: { duration: 0.3 },
                        }
                  }
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        key={s.state}
                        initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                        transition={
                          reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }
                        }
                        className="absolute inset-0 inline-flex items-center justify-center"
                        aria-hidden
                      >
                        <Database
                          className={cn(
                            "h-3 w-3",
                            s.state === "running"
                              ? "animate-pulse text-violet-500 motion-reduce:animate-none"
                              : "text-violet-500/70",
                          )}
                        />
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span
                    className={cn(
                      "transition-colors duration-300",
                      s.state === "running"
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.state === "running" ? "Consultando" : "Consultou"} {s.label}
                    {s.state === "running" ? "…" : ""}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

// Reveal do corpo da resposta: so monta quando o primeiro token chega; quando
// monta, fade-in com delay curto para entrar DEPOIS que a trilha terminou de
// recolher. Sequencia a "historia" da bolha: pensando -> consultando ->
// (trilha colapsa) -> texto aparece, sem competicao visual.
function AssistantBodyReveal({
  hasContent,
  children,
}: {
  hasContent: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  if (!hasContent) return null;
  // Sem delay: o corpo da resposta entra IMEDIATAMENTE quando o primeiro
  // token chega, em PARALELO com o recolhimento da trilha e o morph do
  // header. Tudo na mesma cena, sem hierarquia sequencial.
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }
      }
    >
      {children}
    </motion.div>
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

// Dots animados pos icone Sparkles no header "Pensando". Mesma cadencia da
// LoadingBubble da entrada do turno. Respeita prefers-reduced-motion.
function AnimatedDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5" aria-hidden>
      <span
        className="inline-block h-1 w-1 rounded-full bg-violet-500 motion-reduce:animate-none"
        style={{ animation: "agentDotBounce 1s ease-in-out infinite", animationDelay: "0s" }}
      />
      <span
        className="inline-block h-1 w-1 rounded-full bg-violet-500 motion-reduce:animate-none"
        style={{ animation: "agentDotBounce 1s ease-in-out infinite", animationDelay: "0.15s" }}
      />
      <span
        className="inline-block h-1 w-1 rounded-full bg-violet-500 motion-reduce:animate-none"
        style={{ animation: "agentDotBounce 1s ease-in-out infinite", animationDelay: "0.3s" }}
      />
    </span>
  );
}

// Renderiza content streaming com cada palavra nova entrando via animacao
// CSS (opacity 0 + y 4px -> 1 / 0) com duration 250ms. Palavras antigas
// nao reanimam: useRef Set trackeia indices ja "settled"; React re-render
// usa key index e a CSS animation com fill-mode forwards (definida via
// keyframe nexWordIn em globals.css) so dispara na primeira vez. Quando
// streaming termina, AgentMessage troca para MarkdownLite (renderiza
// negrito, listas etc com syntax completa).
function StreamingText({ content }: { content: string }) {
  // Preserva espacos (split capturando whitespace) para alinhamento natural.
  const tokens = React.useMemo(() => content.split(/(\s+)/), [content]);
  const settledRef = React.useRef<Set<number>>(new Set());

  return (
    <span aria-live="polite" className="whitespace-pre-wrap">
      {tokens.map((tok, i) => {
        const isWhitespace = /^\s+$/.test(tok);
        if (isWhitespace) return <React.Fragment key={i}>{tok}</React.Fragment>;
        const wasSettled = settledRef.current.has(i);
        if (!wasSettled) settledRef.current.add(i);
        return (
          <span
            key={i}
            className={wasSettled ? undefined : "nex-word-in"}
            style={
              wasSettled
                ? undefined
                : {
                    // Typewriter rapido: palavras entram em cascata curta,
                    // sensacao de digitacao viva. Cap 80ms para nao arrastar
                    // respostas longas; periodo 12 distribui o stagger no
                    // grupo de palavras visiveis no viewport tipico.
                    animationDelay: `${Math.min((i % 12) * 14, 80)}ms`,
                  }
            }
          >
            {tok}
          </span>
        );
      })}
    </span>
  );
}

// "Pensando" com shimmer wave passando suavemente pelas letras. Usa tokens
// semanticos do design system (text-muted-foreground -> text-foreground)
// para adaptar automaticamente entre tema escuro e claro sem cor hardcoded
// (fix do problema reportado: invisivel no dark mode).
function ShimmerText({ text }: { text: string }) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent",
        "bg-gradient-to-r from-muted-foreground/60 via-foreground to-muted-foreground/60",
        "motion-reduce:bg-none motion-reduce:text-foreground/85",
      )}
      style={{
        backgroundSize: "200% 100%",
        animation: "nexShimmer 2.2s ease-in-out infinite",
        // Promove a layer proprio para isolar a pintura do gradient.
        // Sem isso, quando algo abaixo do header cresce (steps entrando),
        // o reflow re-pintava o gradient com subpixel diferente = tremor.
        willChange: "background-position",
      }}
    >
      {text}
    </span>
  );
}
