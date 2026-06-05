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
  Lightbulb,
  Scale,
  Search,
  Loader2,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AudioPlayer } from "@/components/agent/audio-player";
import { FeedbackControl, type FeedbackRating } from "./feedback-control";
import { RATING_META } from "./rating-meta";
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
   * Habilita o efeito de digitacao (typewriter). True SO para a resposta
   * gerada AO VIVO nesta interacao. Mensagens carregadas do historico vem com
   * reveal=false e aparecem prontas (sem re-digitar ao reabrir a bubble).
   */
  reveal?: boolean;
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
  /** Chamado quando a digitacao (typewriter) termina de revelar a resposta
   *  inteira. So dispara para mensagens com reveal=true. */
  onRevealComplete?: () => void;
  /** B1. Habilita o controle de feedback (checkpoint PRODUCTION). */
  feedbackEnabled?: boolean;
  /** B1. Id real (de banco) da Message; ausente => controle nao renderiza. */
  dbMessageId?: string;
  /** B1. Voto vigente do usuario sobre esta resposta. */
  feedback?: { rating: FeedbackRating; comment: string | null } | null;
  /** B1. Submete o voto (otimismo fica no chat-panel). */
  onSubmitFeedback?: (rating: FeedbackRating, comment?: string) => Promise<void> | void;
  /**
   * B2 (monitoramento, read-only). Sugestões que o agente ofereceu nesta
   * resposta, exibidas DENTRO da bolha num bloco colapsável com chevron igual
   * ao "Raciocínio". Gated: só renderiza quando presente, então a bubble viva
   * (que usa a barra de sugestões clicável separada) não é afetada.
   */
  suggestions?: string[];
  /** B2. Qual sugestão o usuário clicou (distinção só por contraste de cor). */
  clickedSuggestion?: string;
  /**
   * B2 (monitoramento). PERÍCIA: veredito interno da plataforma (juiz) sobre
   * esta resposta. Renderiza um chip rotulado no rodapé da bolha (eixo
   * plataforma), clicável pro Backtest via `href`. Cor/label vêm prontos do
   * monitor para não acoplar o AgentMessage ao enum de status.
   */
  monitorPericia?: { label: string; color: string; href?: string } | null;
  /**
   * B2 (monitoramento). AVALIAÇÃO: voto do usuário, badge de canto inferior
   * direito (igual ao FeedbackControl da bubble viva). Quando há `comment`,
   * o badge vira clicável e revela o texto escrito pelo usuário.
   */
  monitorVote?: { rating: FeedbackRating; comment?: string | null } | null;
}

export function AgentMessage({
  role,
  content,
  toolName,
  kind = "text",
  audioBlobUrl,
  durationSeconds,
  streaming = false,
  reveal = false,
  steps,
  stepsCollapsed = true,
  onToggleSteps,
  durationMs,
  createdAt,
  onRevealComplete,
  feedbackEnabled = false,
  dbMessageId,
  feedback,
  onSubmitFeedback,
  suggestions,
  clickedSuggestion,
  monitorPericia,
  monitorVote,
}: AgentMessageProps) {
  if (role === "loading") return <LoadingBubble />;
  if (role === "tool") return <ToolBubble name={toolName ?? "tool"} />;

  const isUser = role === "user";

  // Mensagens de áudio (usuário): player + transcrição
  if (kind === "audio") {
    return (
      <div className="group/msg flex w-full justify-end">
        <div className="relative flex max-w-[80%] flex-col gap-1.5">
          {audioBlobUrl ? (
            <AudioPlayer
              src={audioBlobUrl}
              durationSeconds={durationSeconds}
            />
          ) : (
            <div className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              (áudio expirado)
            </div>
          )}
          {content && (
            <div className="rounded-xl bg-violet-600/15 px-3 py-1.5 text-xs text-muted-foreground">
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
      {/* Wrapper relativo SEM overflow: ancora o CopyButton no canto da
          bolha sem ser clipado pelo overflow:hidden do BubbleSurface (que
          existe para a animacao de altura). max-w mora aqui agora; o
          BubbleSurface preenche este wrapper (max-w-full). */}
      <div className="relative max-w-[80%]">
        <BubbleSurface
          isUser={isUser}
          // fastGrow=true quando typewriter ativo (streaming AND content
          // > 0): bolha cresce com transition 100ms para acompanhar char
          // a char sem clipar. Fora desse caso (trail "Pensando" / steps
          // entrando / mensagem do user): 1.1s para o efeito suave.
          fastGrow={!isUser && streaming && content.length > 0}
        >
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
            {isUser ? (
              // Mensagem do usuario: NUNCA tem typewriter, vai completa.
              // Quando ele aperta Enter ou clica numa sugestao, a frase ja
              // existe inteira; animar seria artificio sem sentido.
              <span className="whitespace-pre-wrap">{content}</span>
            ) : reveal ? (
              // So a resposta gerada AO VIVO digita. Historico (reveal=false)
              // renderiza markdown direto, sem re-digitar ao reabrir a bubble.
              <TypewriterBody
                content={content}
                streaming={streaming}
                onComplete={onRevealComplete}
              />
            ) : (
              <MarkdownLite content={content} />
            )}
          </AssistantBodyReveal>
          {!isUser && Array.isArray(suggestions) && suggestions.length > 0 ? (
            <AssistantSuggestionsBlock
              suggestions={suggestions}
              clickedSuggestion={clickedSuggestion}
            />
          ) : null}
          {monitorPericia || (createdAt && !streaming) ? (
            <div className="mt-2 flex items-center gap-2">
              {monitorPericia ? <PericiaChip {...monitorPericia} /> : null}
              {createdAt && !streaming ? (
                <div
                  className={cn(
                    // pr-3.5: reserva o minimo para o badge de canto (voto) nao
                    // cobrir a data. Vale pra bolha do user e da IA.
                    "ml-auto pr-3.5 text-[10px] tabular-nums text-muted-foreground/70",
                  )}
                  suppressHydrationWarning
                >
                  {formatRelativeDateTime(createdAt)}
                </div>
              ) : null}
            </div>
          ) : null}
        </BubbleSurface>
        <CopyButton text={content} />
        {!isUser &&
        kind === "text" &&
        !streaming &&
        content.length > 0 &&
        feedbackEnabled &&
        dbMessageId &&
        onSubmitFeedback ? (
          <FeedbackControl
            current={feedback ?? null}
            onSubmit={(rating, comment) => onSubmitFeedback(rating, comment)}
          />
        ) : null}
        {monitorVote ? (
          <MonitorVoteBadge
            rating={monitorVote.rating}
            comment={monitorVote.comment ?? null}
          />
        ) : null}
      </div>
    </BubbleWrapper>
  );
}

// Bolha SEM motion.layout. Por que: tokens streamam a cada ~30ms; com
// motion.layout o framer fica em loop perpetuo de re-layout durante o
// streaming, aplicando transform: scale() no container que mascara o
// CSS keyframe nexWordIn das palavras (efeito final: usuario nao ve
// digitacao, ve texto pronto). Trilha ainda anima recolhimento via
// AnimatePresence height-auto, header morpha em paralelo, e a bolha
// cresce naturalmente token a token (sem saltos visiveis porque o
// browser pinta a cada frame). Adicionado will-change:transform na
// borda externa para promover layer (paint isolado, sem repaint da
// vizinhanca quando altura muda).
// BubbleSurface SEM motion.layout: o "lag de compressao" que aparecia
// vinha do FLIP do framer (transform: scale) que deforma os filhos
// durante a transicao. Agora a bolha cresce naturalmente via CSS
// conforme novos steps ou texto entram. A sensacao de "expansao suave"
// vem da entrada animada dos filhos (motion.li opacity+slide) e do
// AnimatePresence height-auto do container da trilha. Sem deformacao
// de texto, sem lag, sem "bolha nova nascendo".
function BubbleSurface({
  isUser,
  children,
}: {
  isUser: boolean;
  children: React.ReactNode;
  layoutDep?: unknown;
  enableLayout?: boolean;
  fastGrow?: boolean;
}) {
  // Altura NATURAL (sem animacao de height + sem overflow:hidden). A versao
  // antiga animava `height` por 1.1s com overflowY:hidden, o que clipava o
  // texto recem-digitado e fazia a janela "nao acompanhar" o reveal (o scroll
  // so seguia quando a altura animada alcancava o conteudo, 1.1s depois). Com
  // altura auto a bolha cresce em tempo real junto com o texto: sem clip, sem
  // lag, e o stick-to-bottom do ChatPanel segue o crescimento na hora. As
  // animacoes de "expansao suave" continuam vindo dos filhos (reveal do corpo
  // e abertura da trilha), nao do container.
  return (
    <div
      className={cn(
        // rounded-lg: quinas menos arredondadas (pedido do usuario).
        "relative w-fit max-w-full rounded-xl px-3 text-sm leading-relaxed",
        isUser
          ? "bg-violet-600/15 text-foreground"
          : "bg-muted text-foreground",
      )}
    >
      <div className="py-2">{children}</div>
    </div>
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
      // SEM layout="position": quando o filho (bolha) cresce em largura
      // ou altura, o FLIP do framer aplicava transform: scale transitorio
      // que aparecia como "overshoot horizontal" - bolha esticava muito
      // pra direita e voltava. Sem layout, a bolha cresce 100% natural
      // (CSS), e as transicoes internas (motion.li opacity+slide) cuidam
      // do feel "suave".
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : { opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }
      }
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
      : `Raciocínio · ${total}${total === 1 ? " tool" : " tools"}${durationLabel}`;
  const expanded = streaming || !collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const showThinking = streaming || running;
  const EASE = [0.16, 1, 0.3, 1] as const;

  // Auditoria ui-ux-pro-max:
  // - §7 layout-shift-avoid + transform-performance: removidos TODOS os
  //   animatorios de layout (motion.layout, CSS grid 0fr->1fr, motion.li
  //   layout, filter blur). Tudo agora e opacity + translate puro.
  // - §6 line-length / leading-snug: header com min-h fixo para shimmer
  //   nao sentir reflow vindo dos steps abaixo.
  // - §7 motion-consistency: duration unica de 200ms para crossfades.
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-expanded={expanded}
        aria-controls="agent-trail-list"
        className={cn(
          // min-h-[18px]: altura estavel do header impede que a paint do
          // shimmer "tremesca" quando steps entram/saem abaixo. Sem isso,
          // qualquer reflow re-pinta o gradient com subpixel diferente.
          "flex min-h-[18px] w-full items-center gap-2 text-left text-xs font-medium leading-none",
          "text-foreground/85 transition-colors",
          onToggle
            ? "cursor-pointer hover:text-foreground"
            : "cursor-default",
        )}
      >
        <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <AnimatePresence initial={false}>
            {showThinking ? (
              <motion.span
                key="icon-thinking"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE }}
                className="absolute inset-0 inline-flex items-center justify-center"
                aria-hidden
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              </motion.span>
            ) : (
              <motion.span
                key="icon-done"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE }}
                className="absolute inset-0 inline-flex items-center justify-center"
                aria-hidden
              >
                <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {/* Label crossfade em paralelo (sem mode="wait"): old fica saindo
            enquanto new entra. Duracao 0.5s com slight y translate +
            blur reduction = morph mais visivel e premium, sensacao de
            "transformacao" em vez de "swap brusco". */}
        <span className="relative flex-1">
          <AnimatePresence initial={false}>
            <motion.span
              key={showThinking ? "label-thinking" : "label-done"}
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 6, filter: "blur(3px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -6, filter: "blur(3px)" }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      duration: 0.22,
                      ease: EASE,
                      filter: { duration: 0.18 },
                    }
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
      {/* Expand/collapse: framer-motion mede height real e anima para pixel
          exato (sem o jank do CSS grid 0fr->1fr que causa re-layout pos
          animacao). overflow:hidden no proprio motion.div. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="trail-body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    // Feedback imediato: abrir/fechar o "Raciocinio" responde
                    // na hora (~160ms), sem o arrasto antigo de 1.1s que
                    // deformava os componentes durante a reorganizacao.
                    height: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.12, ease: "easeOut" },
                  }
            }
            style={{ overflow: "hidden" }}
            aria-hidden={!expanded}
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
                    // Entry suave em 0.5s: opacity + translateY leve (-3px).
                    // O salto de altura da bolha eh absorvido pelo
                    // BubbleSurface.motion.layout="size" (interpola entre
                    // tamanhos). Aqui so a opacity + slide subtil pra
                    // sensacao de "se materializando" sem susto.
                    initial={reduce ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    // Entrada rapida (~150ms, sem delay) para o passo aparecer
                    // junto com a expansao instantanea da bolha.
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
                    }
                    className="flex items-center gap-1.5 text-[11px]"
                  >
                    <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center">
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={s.state}
                          initial={reduce ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                          transition={
                            reduce ? { duration: 0 } : { duration: 0.18, ease: EASE }
                          }
                          className="absolute inset-0 inline-flex items-center justify-center"
                          aria-hidden
                        >
                          {/* Tools de BI (consulta avancada) ganham icone
                              de lupa (Search). Demais tools ficam com
                              Database. Cor violet da marca em ambos. */}
                          {s.label === "consulta avançada" ? (
                            <Search
                              className={cn(
                                "h-3 w-3",
                                s.state === "running"
                                  ? "animate-pulse text-violet-500 motion-reduce:animate-none"
                                  : "text-violet-500/70",
                              )}
                            />
                          ) : (
                            <Database
                              className={cn(
                                "h-3 w-3",
                                s.state === "running"
                                  ? "animate-pulse text-violet-500 motion-reduce:animate-none"
                                  : "text-violet-500/70",
                              )}
                            />
                          )}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span
                      className={cn(
                        "transition-colors duration-200",
                        s.state === "running"
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {/* BI: label "consulta avancada" e auto-explicativo,
                          sem prefixo "Consultou/Consultando". Demais tools:
                          mantem prefixo (ex. "Consultou faturamento"). */}
                      {s.label === "consulta avançada"
                        ? `${s.label}${s.state === "running" ? "…" : ""}`
                        : `${s.state === "running" ? "Consultando" : "Consultou"} ${s.label}${s.state === "running" ? "…" : ""}`}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sugestões absorvidas na bolha (B2 monitoramento, read-only)                 */
/* -------------------------------------------------------------------------- */

// Espelha o AssistantTrailBlock (mesma linguagem visual do "Raciocínio"):
// header colapsável com chevron + "Sugestões · N". A lâmpada (ícone outline)
// aparece SÓ quando alguma sugestão foi clicada nesta mensagem; ausência do
// ícone = ninguém clicou. O chip clicado se distingue apenas pelo contraste
// de cor (sem selo de texto). Colapso interno.
function AssistantSuggestionsBlock({
  suggestions,
  clickedSuggestion,
}: {
  suggestions: string[];
  clickedSuggestion?: string;
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = React.useState(false);
  const total = suggestions.length;
  const hasClicked = Boolean(clickedSuggestion);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const EASE = [0.16, 1, 0.3, 1] as const;
  const listId = React.useId();

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={listId}
        className={cn(
          // Mesma fonte do header "Raciocínio" (text-xs): consistência visual.
          "flex min-h-[18px] w-full items-center gap-2 text-left text-xs font-medium leading-none",
          "cursor-pointer text-foreground/85 transition-colors hover:text-foreground",
        )}
      >
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        {hasClicked ? (
          // Presença da lâmpada = o usuário clicou numa das sugestões nesta
          // mensagem. Mesmo ícone outline de sempre.
          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <Lightbulb
              className="h-3.5 w-3.5 text-violet-400"
              aria-label="Uma sugestão foi clicada"
            />
          </span>
        ) : null}
        <span className="flex-1 truncate">
          {`Sugestões · ${total}${total === 1 ? " sugestão" : " sugestões"}`}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="suggestions-body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    height: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.12, ease: "easeOut" },
                  }
            }
            style={{ overflow: "hidden" }}
          >
            <ul id={listId} className="mt-1.5 flex flex-col gap-1.5 pl-5">
              {suggestions.map((s, i) => {
                const clicked = s === clickedSuggestion;
                return (
                  <motion.li
                    key={i}
                    initial={reduce ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.15, ease: EASE }
                    }
                    title={clicked ? "Sugestão clicada pelo usuário" : undefined}
                    className={cn(
                      "self-start rounded-2xl border px-3 py-1.5 text-[13px] leading-snug [overflow-wrap:anywhere]",
                      // A clicada se distingue só pelo contraste de cor (preenchida).
                      clicked
                        ? "border-violet-400/70 bg-violet-600/35 font-medium text-foreground"
                        : "border-violet-500/30 bg-violet-500/10 text-foreground/90",
                    )}
                  >
                    {s}
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Reveal do corpo da resposta: so monta quando o primeiro token chega; quando
// monta, fade-in com delay curto para entrar DEPOIS que a trilha terminou de
// recolher. Sequencia a "historia" da bolha: pensando -> consultando ->
// (trilha colapsa) -> texto aparece, sem competicao visual.
// Body fade-in suave 0.35s: entra em paralelo com o recolhimento da trilha
// (0.55s) - quando body aparece a trilha ainda esta saindo, dando sensacao
// de "passagem de bastao" continua em vez de transicao brusca. O typewriter
// interno comeca a digitar imediatamente, mesmo durante o fade-in.
function AssistantBodyReveal({
  hasContent,
  children,
}: {
  hasContent: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  if (!hasContent) return null;
  return (
    <motion.div
      // Orquestracao: delay 0.25s para o body comecar a aparecer DEPOIS
      // que a trilha ja recolheu pelo menos metade. Fade 0.4s + leve
      // translate-y 4 pra 0. Sensacao de "se levantando" enquanto a
      // trilha some - sem ambos competirem no mesmo instante.
      // mt-2 cria respiro do trail acima (trail nao tem mais mb-2 -
      // a bolha solo "Pensando" agora tem padding equilibrado, e quando
      // body aparece esta espacado dele).
      className="mt-2"
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              duration: 0.2,
              delay: 0.04,
              ease: [0.16, 1, 0.3, 1] as const,
            }
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
      <div className="flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
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

// B2 (monitoramento). PERÍCIA: chip rotulado do veredito interno (juiz) no
// rodapé da bolha. Cor/label prontos. Clicável pro Backtest quando há href.
// Eixo "plataforma", distinto do voto do usuário (badge de canto).
function PericiaChip({
  label,
  color,
  href,
}: {
  label: string;
  color: string;
  href?: string;
}) {
  // Só o ícone (balança = perícia) + o status. A palavra "Perícia" sai; o
  // ícone é o mesmo usado nas colunas, então já comunica o eixo.
  const inner = (
    <span
      title={`Perícia: ${label}`}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={{ color, borderColor: `${color}66`, background: `${color}1f` }}
    >
      <Scale className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link
      href={href}
      title="Ver esta perícia no Backtest"
      className="inline-flex transition-opacity hover:opacity-80"
    >
      {inner}
    </Link>
  );
}

// B2 (monitoramento). AVALIAÇÃO: badge de canto do voto do usuário, igual ao
// estado "escolhido" do FeedbackControl da bubble viva (mesmo ícone/cor/posição).
// Quando o usuário escreveu um comentário, o badge ganha um ponto indicador e
// vira clicável: o clique abre um cartão com o texto (senão não há o que abrir,
// e o admin nem perde o clique).
function MonitorVoteBadge({
  rating,
  comment,
}: {
  rating: FeedbackRating;
  comment: string | null;
}) {
  const meta = RATING_META[rating];
  const Icon = meta.Icon;
  const hasComment = Boolean(comment && comment.trim().length > 0);
  // `open` = fixado por clique (permanece). `hover` = temporário enquanto o
  // mouse está sobre o badge. Visível = um ou outro.
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const showComment = hasComment && (open || hover);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const badgeStyle = { background: meta.color, borderColor: meta.color };
  const baseCls =
    "absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center rounded-md border text-white shadow-sm";

  return (
    <div ref={rootRef}>
      {hasComment ? (
        <button
          type="button"
          aria-label={`Avaliação do usuário: ${meta.label}. Tem comentário, clique para ver.`}
          title="Ver comentário do usuário"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={badgeStyle}
          className={cn(baseCls, "cursor-pointer")}
        >
          <Icon className="h-3 w-3" />
          {/* Ponto indicador: existe comentário escrito. */}
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-background bg-foreground" />
        </button>
      ) : (
        <div
          aria-label={`Avaliação do usuário: ${meta.label}`}
          title={`Avaliação do usuário: ${meta.label}`}
          style={badgeStyle}
          className={baseCls}
        >
          <Icon className="h-3 w-3" />
        </div>
      )}

      <AnimatePresence>
        {showComment ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            // Largura cheia da bolha (left-0 right-0): puxa pra esquerda e fica
            // mais baixo verticalmente, melhor de ler.
            className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-border bg-popover p-2.5 shadow-xl"
          >
            <div
              className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: meta.color }}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
              <span className="text-muted-foreground/70">· comentário</span>
            </div>
            <p className="text-xs leading-snug text-foreground [overflow-wrap:anywhere]">
              {comment}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
  // Ordem importa: **negrito** antes de *italico*; _italico_ e `codigo`.
  const regex =
    /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
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
          className="rounded bg-violet-600/10 px-1 py-0.5 font-mono text-[0.8em] text-violet-700 dark:text-violet-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // *italico* ou _italico_
      nodes.push(
        <em key={key++} className="italic text-foreground/90">
          {token.slice(1, -1)}
        </em>,
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
// SMOOTH STREAMING (padrao Vercel AI SDK / Linear / Notion AI): texto
// revelado WORD-BY-WORD com fade-in suave + blur reduction. Independente
// do backend (OpenAI, Anthropic, Gemini, OpenRouter), todos passam pelo
// mesmo efeito visual.
//
// Funcionamento:
// - Split em tokens (palavras + whitespace preservado).
// - rAF loop incrementa `visibleCount` em palavras/seg adaptativos.
// - Cada palavra renderiza com classe CSS `.nex-word-soft` que dispara
//   keyframe `nexWordSoft` (opacity 0→1 + blur 4px→0) em 380ms.
// - Whitespace renderiza como text node puro (sem span) para o wrap
//   natural de linhas funcionar.
// - Cursor com glow violet acompanha a digitacao.
// - Quando catch-up + !streaming, swap automatico para MarkdownLite.
function TypewriterBody({
  content,
  streaming,
  onComplete,
}: {
  content: string;
  streaming: boolean;
  onComplete?: () => void;
}) {
  const tokens = React.useMemo(() => content.split(/(\s+)/), [content]);
  const [visibleCount, setVisibleCount] = React.useState(0);
  const tokensRef = React.useRef(tokens);
  React.useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);
  const visibleRef = React.useRef(0);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (reduce) {
      visibleRef.current = tokensRef.current.length;
      setVisibleCount(visibleRef.current);
      return;
    }
    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      const target = tokensRef.current.length;
      const cur = visibleRef.current;
      if (cur < target) {
        const gap = target - cur;
        // Words per second adaptativo: 7 wps baseline (~420 wpm legivel
        // confortavel), acelera 0.5 wps por palavra de gap (sem cap
        // agressivo). Para uma resposta de 80 palavras revela em ~6s
        // - sensacao de digitacao premium, nao "brega".
        const wps = Math.min(28, 7 + gap * 0.5);
        const step = (dt / 1000) * wps;
        const next = Math.min(target, cur + step);
        visibleRef.current = next;
        const floored = Math.floor(next);
        if (floored !== Math.floor(cur)) setVisibleCount(floored);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [reduce]);

  const caughtUp = visibleCount >= tokens.length;
  // Avisa o pai quando a digitacao terminou (texto inteiro revelado + backend
  // concluido). O ChatPanel usa isso para so entao mostrar os chips de sugestao
  // e para parar o auto-scroll. Dispara uma unica vez.
  const revealDone = caughtUp && !streaming;
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (revealDone && !firedRef.current) {
      firedRef.current = true;
      onComplete?.();
    }
  }, [revealDone, onComplete]);
  // Swap para MarkdownLite (bolds, listas, code) so quando o texto FOI
  // revelado por inteiro (caughtUp) E o backend terminou (!streaming).
  //
  // Por que nao `!streaming` puro: muitos providers (OpenAI, Gemini,
  // OpenRouter) nao emitem tokens incrementais , a resposta chega inteira no
  // evento `done` com streaming:false. Com `!streaming` o texto aparecia de
  // uma vez (sem digitacao). Com `caughtUp && !streaming`, o RAF revela
  // palavra por palavra mesmo nesse caso (efeito de digitacao client-side,
  // identico ao Claude.ai), formatando markdown so ao terminar. Para o
  // Anthropic (que ja streama), o comportamento e o mesmo de antes.
  // reduce-motion: o RAF preenche tudo de imediato -> caughtUp na hora ->
  // sem digitacao falsa.
  if (caughtUp && !streaming) {
    return <MarkdownLite content={content} />;
  }

  const visibleTokens = reduce ? tokens : tokens.slice(0, visibleCount);

  return (
    <span aria-live="polite" className="whitespace-pre-wrap">
      {visibleTokens.map((tok, i) => {
        // Whitespace como text node puro: garante wrap natural de linhas.
        if (/^\s+$/.test(tok)) return <React.Fragment key={i}>{tok}</React.Fragment>;
        // Palavra com classe nex-word-soft: opacity 0->1 + text-shadow
        // violet temporario que decai em 560ms. Sem cursor, sem blur.
        // Padrao Apple Intelligence / Claude.ai polished.
        return (
          <span key={i} className="nex-word-soft">
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
        // Layer isolation contra tremor: contain:paint+layout fecha o paint
        // do shimmer em um stacking context proprio; willChange:transform
        // promove a layer GPU. Resultado: quando steps aparecem abaixo do
        // header, o reflow do parent NAO re-pinta o gradient (a paint do
        // shimmer fica isolada). transform:translateZ(0) forca composite
        // mesmo se o browser nao decidir promover sozinho.
        willChange: "transform, background-position",
        transform: "translateZ(0)",
        contain: "paint layout",
        backfaceVisibility: "hidden",
      }}
    >
      {text}
    </span>
  );
}
