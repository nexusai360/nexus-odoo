"use client";

/**
 * ChatPanel , painel de chat do agente nexus-odoo.
 *
 * Portado de nexus-insights/src/components/nex/nex-chat-panel.tsx.
 * Adaptações principais:
 * - Consome o endpoint SSE /api/agent/stream (Task 3.2) em vez de Server Action.
 * - Processa eventos SSE: status(thinking) → loading bubble; token → streaming;
 *   tool_call → ToolBubble; done → resposta final com sugestões.
 * - Sem localStorage: histórico vem do servidor (conversationId persistido).
 * - Streaming cursor piscante em mensagens assistant (AgentMessage.streaming).
 * - Botão de áudio condicional via audioInputEnabled (Task 3.3c).
 * - Renomeação nex→agent; "Agente Nex" → "Agente"; "nexDotBounce" → "agentDotBounce".
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §3
 */

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Download, Loader2, LogOut, Mic, MoreVertical, Send, Sparkles, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AgentMessage, type AgentMessageRole } from "./agent-message";
import { SuggestionsBar } from "./suggestions-bar";
import { ProgressTrail, type ProgressStep } from "./progress-trail";
import { AudioRecorder, type AudioRecorderHandle } from "./audio-recorder";
import { AttachMenu, defaultAttachHandler } from "./attach-menu";
import { MessageInput } from "./message-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getConversationMessages } from "@/lib/actions/conversation-messages";
import { exportConversationReport } from "@/lib/actions/agent-conversation-export";
import { WELCOME_SUGGESTIONS } from "@/lib/agent/welcome-suggestions";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** Quando true exibe botão de gravação de áudio (Task 3.3c). */
  audioInputEnabled?: boolean;
  /** Quando true exibe o anexo (clip). Gated pelo checkpoint de imagem. */
  imageInputEnabled?: boolean;
  /** conversationId atual (null = novo). Após primeira msg, recebe o id criado. */
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  /** "Encerrar sessão": limpa o turno atual e fecha o painel (o pai zera o
   *  conversationId). Quando ausente, o item não aparece no menu. */
  onEndSession?: () => void;
  /** Limite de sugestões clicáveis (welcome + follow-up) configurado no
   *  /agente/comportamento pelo super_admin. Default 3, hard cap 5. */
  maxSuggestions?: number;
  /** Sugestões iniciais personalizadas (auto-aprendizado por usuário).
   *  Quando vazias, o painel cai no catálogo curado WELCOME_SUGGESTIONS. */
  personalizedWelcome?: string[];
  /** Quando true, renderiza no menu da bubble a opção "Baixar relatório
   *  desta conversa". Restrito a super_admin pelo layout protegido. */
  isSuperAdmin?: boolean;
}

interface UiMessage {
  id: string;
  /** "progress" continua existindo enquanto o turno está streamando para
   *  mostrar o feedback de pensamento. No `done` ele é absorvido pelo
   *  assistant (Onda C do Renascimento, elimina o gap). */
  role: AgentMessageRole | "progress";
  content: string;
  /** Passos da trilha de progresso. Em "progress" durante streaming; em
   *  "assistant" após `done` (absorvido). */
  steps?: ProgressStep[];
  /** Trilha colapsada (default após absorção no done; usuário expande). */
  stepsCollapsed?: boolean;
  /** Timestamps para calcular duração total exibida no header da trilha. */
  startedAt?: number;
  doneAt?: number;
  kind?: "text" | "audio";
  audioBlobUrl?: string | null;
  durationSeconds?: number;
  suggestions?: string[];
  /** True enquanto este turn está sendo streamado. */
  streaming?: boolean;
  /** Timestamp da mensagem para rodapé "dd/mm hh:mm" na bolha. */
  createdAt?: string;
}

type SseEvent =
  | { type: "status"; status: string }
  | { type: "token"; delta: string }
  | { type: "tool_call"; label: string; toolName?: string; toolCallId?: string }
  | { type: "tool_result"; label: string; truncated: boolean; toolName?: string; toolCallId?: string }
  | { type: "done"; conversationId: string; message: string; suggestions: string[] }
  | { type: "error"; error: string };

export function ChatPanel({
  open,
  onClose,
  audioInputEnabled = false,
  imageInputEnabled = false,
  conversationId: externalConvId,
  onConversationCreated,
  onEndSession,
  maxSuggestions = 3,
  personalizedWelcome = [],
  isSuperAdmin = false,
}: ChatPanelProps) {
  // Sugestoes iniciais: prioridade ao set personalizado computado no server
  // (auto-aprendizado por usuario). Fallback ao catalogo curado quando o
  // usuario nao tem historico ou a query falhou. Em ambos os casos respeita
  // o `maxSuggestions` configurado pelo super_admin.
  const welcomeSuggestionsForUi = React.useMemo(() => {
    const cap = Math.min(Math.max(1, maxSuggestions), 5);
    const personalized = personalizedWelcome.filter(
      (s) => typeof s === "string" && s.trim().length > 0,
    );
    if (personalized.length > 0) return personalized.slice(0, cap);
    return WELCOME_SUGGESTIONS.slice(0, cap);
  }, [maxSuggestions, personalizedWelcome]);
  const reduceMotion = useReducedMotion();

  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [audioFlight, setAudioFlight] = React.useState(false);

  const conversationIdRef = React.useRef<string | null>(externalConvId ?? null);
  // Track conversas criadas nesta sessao do componente para NAO recarregar
  // do banco e perder o estado local (steps do trail nao sao persistidos;
  // recarregar apagaria a trilha "Raciocinio" da primeira resposta, bug
  // reportado pelo usuario em 2026-05-25 01:28).
  const justCreatedConvIdsRef = React.useRef<Set<string>>(new Set());
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const recorderRef = React.useRef<AudioRecorderHandle | null>(null);
  // === Auto-scroll v4: stick-to-bottom padrao (ChatGPT/Claude.ai) ===
  // Spec: docs/superpowers/specs/2026-05-25-bubble-v4-spec.md
  // ResizeObserver no contentRef (inner div com mensagens) detecta
  // crescimento de altura e, se isSticky=true, ajusta scrollTop do
  // scrollRef para scrollHeight. Pattern provado em producao.
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  // Ref espelha state para uso dentro de listeners criados 1x.
  const isStickyRef = React.useRef(true);
  const [isSticky, setIsStickyState] = React.useState(true);
  // Wrapper que ATUALIZA o ref SINCRONAMENTE antes do state. Evita race
  // com o ResizeObserver que le isStickyRef no mesmo tick em que o state
  // changes (useEffect de sync corre depois, perdendo a janela).
  const setIsSticky = React.useCallback((v: boolean) => {
    isStickyRef.current = v;
    setIsStickyState(v);
  }, []);
  // Marca quando ultimo scroll programatico aconteceu. Wheel events nos
  // 120ms seguintes sao ignorados (kinetic scroll do macOS pode gerar
  // wheel falso durante smooth scroll).
  const lastProgrammaticAtRef = React.useRef(0);
  // messageRefsMap mantido (usado por outros lugares para tracking).
  const messageRefsMap = React.useRef<Map<string, HTMLDivElement>>(new Map());

  // Sync external conversationId + carrega histórico do servidor
  React.useEffect(() => {
    conversationIdRef.current = externalConvId ?? null;

    if (!externalConvId) {
      // Nova conversa: limpa mensagens
      setMessages([]);
      return;
    }

    // Skip reload se essa conversa acabou de ser criada nesta sessao:
    // o estado local ja tem a primeira resposta com steps; recarregar
    // do banco perderia steps (nao persistidos) e apagaria o "Raciocinio".
    if (justCreatedConvIdsRef.current.has(externalConvId)) {
      return;
    }

    // Carrega histórico persistido para a conversa selecionada
    let cancelled = false;
    void (async () => {
      const result = await getConversationMessages(externalConvId);
      if (cancelled) return;
      if (!result.ok) {
        toast.error("Não foi possível carregar o histórico da conversa.");
        return;
      }
      const uiMessages: UiMessage[] = result.messages
        .filter((m) => m.role !== "tool")
        // Esconde messages assistant SEM content (iteracao intermediaria do
        // loop que so registra tool_calls; a resposta textual real vem na
        // proxima iteracao). Sem isso, a UI mostra uma bolha cinza com so
        // o timestamp acima da resposta de verdade (bug 2026-05-24 22:59).
        .filter(
          (m) => !(m.role === "assistant" && m.content.trim().length === 0),
        )
        .map((m) => ({
          id: m.id,
          role: m.role as AgentMessageRole,
          content: m.content,
          createdAt: m.createdAt,
        }));
      setMessages(uiMessages);
    })();

    return () => { cancelled = true; };
  }, [externalConvId]);

  // ESC fecha + foco no input ao abrir
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // === Stick-to-bottom: ResizeObserver + wheel/scroll listeners ===
  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    // ResizeObserver no inner content: cresce conforme typewriter escreve
    // ou novas msgs chegam. Se sticky, ajusta scrollTop para o fim.
    const ro = new ResizeObserver(() => {
      if (!isStickyRef.current) return;
      lastProgrammaticAtRef.current = performance.now();
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    ro.observe(contentEl);

    // Wheel up = user quer rolar pra cima = desativa sticky. Ignora se
    // veio logo apos scroll programatico (kinetic scroll macOS).
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        const dt = performance.now() - lastProgrammaticAtRef.current;
        if (dt < 120) return;
        if (isStickyRef.current) setIsSticky(false);
      }
    };
    scrollEl.addEventListener("wheel", onWheel, { passive: true });

    // Touchmove pra baixo (dedo desce na tela) = scroll up.
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y - touchStartY > 8) {
        const dt = performance.now() - lastProgrammaticAtRef.current;
        if (dt < 120) return;
        if (isStickyRef.current) setIsSticky(false);
      }
    };
    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: true });

    // Scroll handler: reativa sticky quando user chega no fim manualmente.
    const onScroll = () => {
      const atBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 24;
      if (atBottom && !isStickyRef.current) setIsSticky(true);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro.disconnect();
      scrollEl.removeEventListener("wheel", onWheel);
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("scroll", onScroll);
    };
  }, []);

  // FAB click: rola pro fim + reativa sticky.
  const scrollToBottomNow = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastProgrammaticAtRef.current = performance.now();
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setIsSticky(true);
  }, [reduceMotion]);

  const handleSend = React.useCallback(
    async (text: string, opts?: { source?: "bubble" | "suggestion" }) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      // Reset do stick-to-bottom: nova msg reativa scroll automatico.
      setIsSticky(true);
      // Snap explicito pra fim apos React commitar a nova msg, antes
      // do ResizeObserver disparar. Garante que a bolha do assistant
      // (que aparece com "Pensando") ja nasce totalmente visivel.
      // Sem isso, havia race: setMessages adicionava bolha; layout
      // crescia; mas RO podia firar com isStickyRef ainda nao
      // atualizado ou o usuario via metade da bolha.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsgId = `u_${crypto.randomUUID()}`;
      const assistantMsgId = `a_${crypto.randomUUID()}`;
      const progressMsgId = `p_${crypto.randomUUID()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInput("");
      setPending(true);

      // Nasce a bolha do assistant ja com trilha "Pensando..." dentro.
      // Sem LoadingBubble separada (eliminado o "Agente pensando" duplicado
      // que aparecia antes do trail; agora e uma transicao continua: o mesmo
      // componente que mostra "Pensando" ganha steps e depois vira resposta).
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          steps: [],
          stepsCollapsed: false,
          startedAt: Date.now(),
          streaming: true,
        },
      ]);

      try {
        const res = await fetch("/api/agent/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            conversationId: conversationIdRef.current ?? undefined,
            meta: { source: opts?.source ?? "bubble" },
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setMessages((prev) => prev.filter((m) => m.id !== "loading"));
          const detalhe = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          toast.error(detalhe?.error ?? `Erro ao contatar o agente (${res.status})`);
          setPending(false);
          return;
        }

        // A bolha do assistente só nasce quando o primeiro token chega (ou no
        // done/error). Até lá fica a loading bubble ou a trilha de progresso ,
        // nunca um caret "|" órfão. Detectamos "já criado" lendo do próprio
        // `prev` dentro do setMessages (race-free com o batching do React).
        const dropLoading = (list: UiMessage[]) =>
          list.filter((m) => m.id !== "loading");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let evt: SseEvent;
            try {
              evt = JSON.parse(raw) as SseEvent;
            } catch {
              continue;
            }

            if (evt.type === "status") {
              // thinking → loading bubble já cobre o estado
            } else if (evt.type === "token") {
              setMessages((prev) => {
                if (prev.some((m) => m.id === assistantMsgId)) {
                  return prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + evt.delta }
                      : m,
                  );
                }
                return [
                  ...dropLoading(prev),
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: evt.delta,
                    streaming: true,
                  },
                ];
              });
            } else if (evt.type === "tool_call") {
              // Onda C v2 do Renascimento: a trilha vive DENTRO da bolha do
              // assistant desde o primeiro tool_call. Sem bolha "progress"
              // separada, sem gap visual em momento algum do streaming.
              const step: ProgressStep = {
                id: evt.toolCallId ?? `s_${crypto.randomUUID()}`,
                label: evt.label,
                state: "running",
              };
              setMessages((prev) => {
                const base = dropLoading(prev);
                if (base.some((m) => m.id === assistantMsgId)) {
                  return base.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, steps: [...(m.steps ?? []), step] }
                      : m,
                  );
                }
                return [
                  ...base,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: "",
                    steps: [step],
                    stepsCollapsed: false,
                    startedAt: Date.now(),
                    streaming: true,
                  },
                ];
              });
            } else if (evt.type === "tool_result") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  let marked = false;
                  const steps = (m.steps ?? []).map((s) => {
                    if (marked) return s;
                    if (s.state !== "running") return s;
                    const byId = evt.toolCallId && s.id === evt.toolCallId;
                    const byLabel = !evt.toolCallId && s.label === evt.label;
                    if (byId || byLabel) {
                      marked = true;
                      return { ...s, state: "done" as const };
                    }
                    return s;
                  });
                  return { ...m, steps };
                }),
              );
            } else if (evt.type === "done") {
              if (evt.conversationId && !conversationIdRef.current) {
                conversationIdRef.current = evt.conversationId;
                // Marca como criada nesta sessao para o useEffect de reload
                // skipar o getConversationMessages e preservar os steps locais.
                justCreatedConvIdsRef.current.add(evt.conversationId);
                onConversationCreated?.(evt.conversationId);
              }
              setMessages((prev) => {
                // Onda C v2: a bolha do assistant ja tem steps (criada no
                // primeiro tool_call). Aqui so finaliza: content/suggestions
                // do done, marca todos os steps como done, colapsa trilha,
                // grava doneAt para o resumo "Raciocinio . N etapas . Xs".
                // Defesa em profundidade contra suggestions vazio: usa o set
                // welcomeSuggestionsForUi (ja respeita maxSuggestions + ancora
                // de role + personalizado). Garante que toda resposta tem chips.
                const dropped = dropLoading(prev);
                const doneAt = Date.now();
                const safeSuggestions =
                  Array.isArray(evt.suggestions) && evt.suggestions.length > 0
                    ? evt.suggestions
                    : welcomeSuggestionsForUi;
                const finalized = dropped.map((m) => {
                  if (m.id === assistantMsgId) {
                    const steps = (m.steps ?? []).map((s) => ({
                      ...s,
                      state: "done" as const,
                    }));
                    return {
                      ...m,
                      content: evt.message,
                      suggestions: safeSuggestions,
                      streaming: false,
                      steps: steps.length > 0 ? steps : undefined,
                      stepsCollapsed: true,
                      startedAt: m.startedAt ?? doneAt,
                      doneAt,
                      createdAt: m.createdAt ?? new Date(doneAt).toISOString(),
                    };
                  }
                  return m;
                });
                if (finalized.some((m) => m.id === assistantMsgId))
                  return finalized;
                return [
                  ...finalized,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: evt.message,
                    suggestions: safeSuggestions,
                    streaming: false,
                    stepsCollapsed: true,
                    startedAt: doneAt,
                    doneAt,
                    createdAt: new Date(doneAt).toISOString(),
                  },
                ];
              });

              // Frente C da inteligencia (auditoria 2026-05-26): chama o
              // contextual suggester com os ultimos 5 pares e substitui as
              // chips por sugestoes contextualizadas. Fire-and-forget; se
              // demorar > 2.5s ou falhar, mantemos as chips originais.
              void (async () => {
                try {
                  const conversationId = evt.conversationId;
                  if (!conversationId) return;
                  const ctrl = new AbortController();
                  const to = setTimeout(() => ctrl.abort(), 3000);
                  const res = await fetch("/api/agent/suggest-continuation", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ conversationId, maxChips: 3 }),
                    signal: ctrl.signal,
                  });
                  clearTimeout(to);
                  if (!res.ok) return;
                  const data = (await res.json()) as {
                    chips?: string[];
                    source?: string;
                  };
                  if (!Array.isArray(data.chips) || data.chips.length === 0) return;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, suggestions: data.chips }
                        : m,
                    ),
                  );
                } catch {
                  // best-effort; mantem chips originais
                }
              })();
            } else if (evt.type === "error") {
              setMessages((prev) => {
                if (prev.some((m) => m.id === assistantMsgId)) {
                  return prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: `**Erro:** ${evt.error}`,
                          streaming: false,
                        }
                      : m,
                  );
                }
                return [
                  ...dropLoading(prev),
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: `**Erro:** ${evt.error}`,
                    streaming: false,
                  },
                ];
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== "loading"),
          {
            id: `e_${Date.now()}`,
            role: "assistant",
            content: `**Erro inesperado:** ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      } finally {
        setPending(false);
        // Garante streaming=false na resposta e remove a loading bubble caso o
        // stream tenha encerrado sem nenhum evento.
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== "loading")
            .map((m) =>
              m.id === assistantMsgId && m.streaming
                ? { ...m, streaming: false }
                : m,
            ),
        );
      }
    },
    [pending, onConversationCreated],
  );

  const handlePickSuggestion = React.useCallback(
    (msgId: string, suggestion: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, suggestions: undefined } : m)),
      );
      void handleSend(suggestion, { source: "suggestion" });
    },
    [handleSend],
  );

  const handleClear = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setMenuOpen(false);
    conversationIdRef.current = null;
  }, []);

  // Transcreve o áudio gravado e envia o texto resultante como pergunta.
  const handleSendAudio = React.useCallback(
    async (blob: Blob) => {
      if (audioFlight) return;
      setAudioFlight(true);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("language", "pt");
        const res = await fetch("/api/agent/transcribe", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d?.error ?? `HTTP ${res.status}`);
        }
        const d = (await res.json()) as { text?: string };
        const text = (d?.text ?? "").trim();
        if (!text) {
          toast.error("Não conseguimos entender o áudio.");
          return;
        }
        void handleSend(text);
      } catch (err) {
        toast.error(
          `Falha ao transcrever: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setAudioFlight(false);
      }
    },
    [audioFlight, handleSend],
  );

  const sendDisabled = pending || input.trim().length === 0;

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 28 };

  const showWelcome = messages.length === 0;

  const innerContent = (
    <>
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-border bg-background/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
              <Sparkles className="h-4.5 w-4.5" strokeWidth={2.25} />
              <span
                aria-hidden
                className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-card"
              />
            </div>
            <div>
              <h2
                id="agent-panel-title"
                className="text-sm leading-tight font-semibold tracking-tight"
              >
                Agente Nex
              </h2>
              <p className="text-xs leading-tight text-muted-foreground">
                Online · respostas em tempo real
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-1">
            <button
              type="button"
              aria-label="Mais opções"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Fechar painel do agente"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
            >
              <X className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 z-10 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleClear}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Limpar histórico
                </button>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false);
                      const cid = conversationIdRef.current;
                      if (!cid) {
                        toast.info(
                          "Nada para exportar ainda. Faça pelo menos uma pergunta.",
                        );
                        return;
                      }
                      const r = await exportConversationReport(cid);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      const blob = new Blob([r.content], {
                        type: "text/plain;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = r.filename;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      toast.success("Relatório baixado.");
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 border-t border-border/50 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    Baixar relatório (.txt)
                  </button>
                ) : null}
                {onEndSession ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      handleClear();
                      onEndSession();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 border-t border-border/50 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                    Encerrar sessão
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </header>

        {/* Área de mensagens. FAB foi movido pro outer motion.div (que e
            fixed = positioning context). Aqui voltou layout original
            (flex-1 + overflow no proprio scrollRef) - sem wrapper extra
            que estava quebrando a cadeia flex de altura. */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        >
          {showWelcome ? (
            <WelcomeBlock
              onPick={(s) => void handleSend(s, { source: "suggestion" })}
              suggestions={welcomeSuggestionsForUi}
            />
          ) : (
            <div ref={contentRef} className="space-y-3">
              {messages.map((m, idx) => {
                // Onda C v2: nao deve mais existir UiMessage com role "progress"
                // (steps vivem dentro da bolha do assistant desde o primeiro
                // tool_call). Mantido como guarda defensiva para historicos
                // legados em flight: filtra silenciosamente.
                if (m.role === "progress") return null;
                const isLastAssistant =
                  m.role === "assistant" && idx === messages.length - 1 && !pending;
                const durationMs =
                  m.startedAt && m.doneAt ? m.doneAt - m.startedAt : undefined;
                return (
                  // Wrapper div com ref por msgId permite snapAssistantToTop
                  // chamar scrollIntoView na bolha exata (feature auto-scroll).
                  // Fragment foi substituido por div; layout preservado via
                  // contents do parent (space-y-3 ja existe).
                  <div
                    key={m.id}
                    ref={(el) => {
                      if (el) messageRefsMap.current.set(m.id, el);
                      else messageRefsMap.current.delete(m.id);
                    }}
                  >
                    <AgentMessage
                      role={m.role}
                      content={m.content}
                      kind={m.kind}
                      audioBlobUrl={m.audioBlobUrl}
                      durationSeconds={m.durationSeconds}
                      streaming={m.streaming}
                      steps={m.steps}
                      stepsCollapsed={m.stepsCollapsed ?? true}
                      createdAt={m.createdAt}
                      durationMs={durationMs}
                      onToggleSteps={() =>
                        setMessages((prev) =>
                          prev.map((x) =>
                            x.id === m.id
                              ? { ...x, stepsCollapsed: !(x.stepsCollapsed ?? true) }
                              : x,
                          ),
                        )
                      }
                    />
                    {isLastAssistant && !m.streaming ? (
                      // SuggestionsBar agora SEMPRE renderiza apos done:
                      // se m.suggestions vazio, o componente completa com
                      // HARD_FALLBACK ate targetCount. Garante chips sempre.
                      <SuggestionsBar
                        suggestions={m.suggestions ?? []}
                        onPick={(s) => handlePickSuggestion(m.id, s)}
                        targetCount={maxSuggestions}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FAB voltar-pro-fim como filho do outer motion.div (fixed
            providencia o positioning context). z-50 garante que fica
            acima do scroll. Visivel quando !isSticky (user rolou pra cima). */}
        <ScrollToBottomFab
          visible={!isSticky && !showWelcome}
          onClick={scrollToBottomNow}
        />

        {/* Input bar (G4 + D8) , anexo à esquerda, mic à direita, enviar fora */}
        <footer className="border-t border-border bg-background/60 px-3 pt-3 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isRecording) {
                recorderRef.current?.sendNow();
                return;
              }
              void handleSend(input);
            }}
            className="flex items-center gap-2"
          >
            {/* Área central: MessageInput quando idle; barra de gravação quando recording. */}
            <div className="min-w-0 flex-1">
              {isRecording ? (
                <div className="flex min-h-9 items-center rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-1">
                  {audioInputEnabled ? (
                    <AudioRecorder
                      ref={recorderRef}
                      mode="embedded"
                      onSend={(blob) => {
                        void handleSendAudio(blob);
                      }}
                      onRecordingStateChange={setIsRecording}
                    />
                  ) : null}
                </div>
              ) : (
                <MessageInput
                  value={input}
                  onChange={setInput}
                  onSend={() => void handleSend(input)}
                  disabled={pending}
                  placeholder="Pergunte ao Agente Nex…"
                  aria-label="Mensagem para o Agente Nex"
                  maxRows={6}
                  leftSlot={
                    imageInputEnabled ? (
                      <AttachMenu
                        disabled={pending}
                        onPick={defaultAttachHandler}
                      />
                    ) : undefined
                  }
                  rightSlot={
                    audioInputEnabled && !audioFlight ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => {
                                void recorderRef.current?.start();
                              }}
                              aria-label="Gravar mensagem de áudio"
                              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                            >
                              <Mic className="h-4 w-4" />
                            </button>
                          }
                        />
                        <TooltipContent>Gravar áudio</TooltipContent>
                      </Tooltip>
                    ) : null
                  }
                  id="agent-bubble-input"
                />
              )}
              {/* Mount persistente do AudioRecorder p/ manter o handle estável.
                  Em idle renderiza null (mode="embedded"). Esta cópia entra em
                  ação quando isRecording=true (mas o componente é remountado;
                  é seguro porque o estado do MediaRecorder está em ref). */}
              {audioInputEnabled && !isRecording ? (
                <div className="sr-only" aria-hidden>
                  <AudioRecorder
                    ref={recorderRef}
                    mode="embedded"
                    onSend={(blob) => {
                      void handleSendAudio(blob);
                    }}
                    onRecordingStateChange={setIsRecording}
                  />
                </div>
              ) : null}
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="submit"
                    aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
                    disabled={isRecording ? false : sendDisabled || audioFlight}
                    className={cn(
                      "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center self-center rounded-xl",
                      "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
                      "transition-all duration-200 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
                      "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                      "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
                    )}
                  >
                    {audioFlight ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </button>
                }
              />
              <TooltipContent>Enviar mensagem (Enter)</TooltipContent>
            </Tooltip>
          </form>
          <p
            className={cn(
              "mt-1.5 px-1 text-[11px] text-muted-foreground transition-opacity",
              isRecording ? "invisible" : "visible",
            )}
          >
            Enter envia · Shift+Enter quebra linha
          </p>
        </footer>
    </>
  );

  // ── Modo flutuante (bubble): dialog animado ───────────────────────────────
  return (
    <>
      {/* Backdrop mobile */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] sm:hidden"
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-panel-title"
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 24, x: 24 }
        }
        animate={
          reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, x: 0 }
        }
        exit={
          reduceMotion
            ? { opacity: 0, transition: { duration: 0.12 } }
            : { opacity: 0, scale: 0.94, y: 16, x: 16, transition: { duration: 0.16, ease: "easeIn" } }
        }
        transition={transition}
        style={{ transformOrigin: "bottom right" }}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-card text-foreground shadow-2xl shadow-black/30",
          // Mobile: ocupa a tela inteira ao abrir.
          "inset-0 rounded-none border-0",
          // Tablet e desktop: janela flutuante adaptativa, cresce com o viewport.
          "sm:inset-auto sm:right-5 sm:bottom-5 sm:rounded-2xl sm:border sm:border-border",
          "sm:h-[66vh] sm:max-h-[500px] sm:w-[340px]",
          "md:w-[360px]",
          "lg:h-[68vh] lg:max-h-[560px] lg:w-[380px]",
          "2xl:max-h-[620px] 2xl:w-[420px]",
        )}
      >
        {innerContent}
      </motion.div>

      {/* Keyframe global para loading dots */}
      <style jsx global>{`
        @keyframes agentDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function WelcomeBlock({
  onPick,
  suggestions,
}: {
  onPick: (q: string) => void | Promise<void>;
  suggestions: string[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-600/40">
        <Sparkles className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <h3 className="text-base font-semibold tracking-tight">
        Olá, sou o Agente Nex.
      </h3>
      <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
        Respostas em tempo real.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void onPick(s)}
            className={cn(
              "cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-all duration-200",
              "hover:border-violet-500/40 hover:bg-violet-600/5 hover:shadow-sm",
              "focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// FAB que aparece quando o usuario rolou pra cima durante streaming.
// Posicionamento: absolute bottom-right do parent relative que envolve o
// scroll container. Click = scroll suave pro final + reativa auto-snap.
function ScrollToBottomFab({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ir para o fim da conversa"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        // bottom-[100px]: respiro de ~24px acima do footer (input ~64px
        // + padding + respiro). Mais distante do botao enviar conforme
        // pedido do usuario. z-30: acima da area de scroll.
        "pointer-events-auto absolute bottom-[100px] right-3 z-30 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full",
        "border border-violet-500/40 bg-background/90 text-violet-600 shadow-lg backdrop-blur",
        "transition-all duration-200 hover:bg-violet-600 hover:text-white hover:border-violet-500",
        "dark:text-violet-300 dark:hover:text-white",
        "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}
