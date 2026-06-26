"use client";

/**
 * BuilderChatPanel , painel de conversa do Construtor de relatorios (F6), com a
 * MESMA experiencia do Agente Nex. Reusa AgentMessage (trilha "Raciocinio" com
 * nº de tools + duracao, copiar, timestamp) e porta a maquinaria provada do
 * ChatPanel: stick-to-bottom, tag de data flutuante, FAB "ir pro fim", menu de
 * 3 pontos (Limpar conversa + Baixar .txt), composer (MessageInput + AttachMenu
 * + AudioRecorder). Diferencas em relacao ao Nex: vive num painel lateral fixo
 * (nao bubble flutuante), fala com /api/builder/stream e persiste a conversa do
 * construtor (mensagens reaparecem ao recarregar).
 */

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Download, Loader2, Mic, MoreVertical, Send, Sparkles, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/lib/format-datetime-relative";
import { AgentMessage } from "@/components/agent/agent-message";
import type { ProgressStep } from "@/components/agent/progress-trail";
import { MessageInput } from "@/components/agent/message-input";
import { AttachMenu } from "@/components/agent/attach-menu";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/agent/audio-recorder";
import { getBuilderConversationMessages } from "@/lib/actions/builder-conversation";
import { arquivarBuilderConversaAction } from "@/lib/actions/builder-conversation";
import { exportarBuilderConversaTxt } from "@/lib/actions/builder-conversation";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

/** Payload entregue ao workspace quando um turno conclui (atualiza o preview). */
export interface BuilderDonePayload {
  ficha?: BuilderReportEntry | null;
  savedId?: string;
  etag?: string;
  recusa?: boolean;
  bloqueado?: boolean;
}

interface BuilderChatPanelProps {
  /** conversationId atual (null = nova). Apos o 1o turno, recebe o id criado. */
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  /** Limpou a conversa ("Limpar conversa"): o pai zera conversationId + ficha. */
  onCleared: () => void;
  /** Turno concluiu: atualiza ficha/savedId/etag no workspace. */
  onDone: (payload: BuilderDonePayload) => void;
  audioEnabled?: boolean;
  anexoEnabled?: boolean;
  /** Mostra "Baixar conversa (.txt)" no menu (admin/super_admin do construtor). */
  podeExportar?: boolean;
}

interface UiMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: ProgressStep[];
  stepsCollapsed?: boolean;
  startedAt?: number;
  doneAt?: number;
  /** Duracao persistida (historico) , tem precedencia sobre started/doneAt. */
  durationMs?: number;
  streaming?: boolean;
  reveal?: boolean;
  revealDone?: boolean;
  createdAt?: string;
  isAudio?: boolean;
  transcribing?: boolean;
  kind?: "text" | "audio";
}

type SseEvent =
  | { type: "status"; status: string }
  | { type: "tool_call"; label: string; toolName?: string; toolCallId?: string }
  | { type: "tool_result"; label: string; toolName?: string; toolCallId?: string }
  | {
      type: "done";
      conversationId: string;
      message: string;
      messageId: string;
      steps?: { label: string }[];
      durationMs?: number;
      savedId?: string;
      etag?: string;
      ficha?: BuilderReportEntry;
      recusa?: boolean;
      bloqueado?: boolean;
      erro?: boolean;
    }
  | { type: "error"; error: string };

export function BuilderChatPanel({
  conversationId,
  onConversationCreated,
  onCleared,
  onDone,
  audioEnabled = false,
  anexoEnabled = false,
  podeExportar = false,
}: BuilderChatPanelProps) {
  const reduceMotion = useReducedMotion();

  const [messages, setMessages] = React.useState<UiMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [audioFlight, setAudioFlight] = React.useState(false);
  const [restoring, setRestoring] = React.useState<boolean>(!!conversationId);

  const conversationIdRef = React.useRef<string | null>(conversationId);
  const justCreatedRef = React.useRef<Set<string>>(new Set());
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const recorderRef = React.useRef<AudioRecorderHandle | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // === Stick-to-bottom (padrao ChatGPT/Claude.ai), portado do ChatPanel ===
  const isStickyRef = React.useRef(true);
  const [, setIsStickyState] = React.useState(true);
  const setIsSticky = React.useCallback((v: boolean) => {
    isStickyRef.current = v;
    setIsStickyState(v);
  }, []);
  const lastProgrammaticAtRef = React.useRef(0);
  const messageRefsMap = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const [dateLabel, setDateLabel] = React.useState("");
  const [showScrollFab, setShowScrollFab] = React.useState(false);
  const messagesRef = React.useRef<UiMsg[]>([]);
  React.useEffect(() => {
    messagesRef.current = messages;
  });

  const recomputeDateLabel = React.useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const list = messagesRef.current;
    if (list.length === 0) {
      setDateLabel("");
      return;
    }
    const topEdge = scrollEl.getBoundingClientRect().top;
    let label = "";
    for (const m of list) {
      if (!m.createdAt) continue;
      const el = messageRefsMap.current.get(m.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top - topEdge <= 16) label = formatDayLabel(m.createdAt);
      else break;
    }
    if (!label) {
      const first = list.find((m) => m.createdAt);
      if (first) label = formatDayLabel(first.createdAt);
    }
    setDateLabel((prev) => (prev === label ? prev : label));
  }, []);

  React.useEffect(() => {
    const id1 = requestAnimationFrame(() =>
      requestAnimationFrame(recomputeDateLabel),
    );
    return () => cancelAnimationFrame(id1);
  }, [messages, recomputeDateLabel]);

  // Sync external conversationId + carrega historico persistido.
  React.useEffect(() => {
    conversationIdRef.current = conversationId;
    if (!conversationId) {
      setMessages([]);
      setRestoring(false);
      return;
    }
    if (justCreatedRef.current.has(conversationId)) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    setRestoring(true);
    void (async () => {
      const result = await getBuilderConversationMessages(conversationId);
      if (cancelled) return;
      if (!result.ok) {
        toast.error("Nao foi possivel carregar a conversa.");
        setRestoring(false);
        return;
      }
      const ui: UiMsg[] = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind: m.kind as "text" | "audio" | undefined,
        ...(m.role === "user" && m.kind === "audio" ? { isAudio: true } : {}),
        ...(m.steps && m.steps.length > 0
          ? {
              steps: m.steps.map((s, i) => ({
                id: `h_${m.id}_${i}`,
                label: s.label,
                state: "done" as const,
                raw: true,
              })),
              stepsCollapsed: true,
              ...(typeof m.durationMs === "number" ? { durationMs: m.durationMs } : {}),
            }
          : {}),
      }));
      setMessages(ui);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ResizeObserver + listeners de scroll/wheel/touch (stick-to-bottom + FAB +
  // tag de data). Re-roda quando a area de mensagens monta (hasMessages).
  const hasMessages = messages.length > 0;
  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const contentEl = contentRef.current;

    const ro = contentEl
      ? new ResizeObserver(() => {
          if (!isStickyRef.current) return;
          lastProgrammaticAtRef.current = performance.now();
          scrollEl.scrollTop = scrollEl.scrollHeight;
        })
      : null;
    if (ro && contentEl) ro.observe(contentEl);

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        const dt = performance.now() - lastProgrammaticAtRef.current;
        if (dt < 120) return;
        if (isStickyRef.current) setIsSticky(false);
      }
    };
    scrollEl.addEventListener("wheel", onWheel, { passive: true });

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

    let pillRaf = false;
    const updatePill = () => {
      if (pillRaf) return;
      pillRaf = true;
      requestAnimationFrame(() => {
        pillRaf = false;
        recomputeDateLabel();
      });
    };
    const onScroll = () => {
      const dist = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (dist < 24) {
        if (!isStickyRef.current) setIsSticky(true);
      } else {
        const dt = performance.now() - lastProgrammaticAtRef.current;
        if (dt > 120 && isStickyRef.current) setIsSticky(false);
      }
      setShowScrollFab(dist > 120);
      updatePill();
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro?.disconnect();
      scrollEl.removeEventListener("wheel", onWheel);
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("scroll", onScroll);
    };
  }, [recomputeDateLabel, hasMessages, setIsSticky]);

  // Auto-scroll durante a geracao: rAF loop cola no fim enquanto gera/digita.
  const lastMsg = messages[messages.length - 1];
  const generating =
    pending ||
    (!!lastMsg && lastMsg.role === "assistant" && !!lastMsg.reveal && !lastMsg.revealDone);
  React.useEffect(() => {
    if (!generating) return;
    let rafId = 0;
    const tick = () => {
      if (isStickyRef.current) {
        const el = scrollRef.current;
        if (el) {
          lastProgrammaticAtRef.current = performance.now();
          el.scrollTop = el.scrollHeight;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [generating]);

  const scrollToBottomNow = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastProgrammaticAtRef.current = performance.now();
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    setIsSticky(true);
    setShowScrollFab(false);
  }, [reduceMotion, setIsSticky]);

  const handleSend = React.useCallback(
    async (text: string, opts?: { isAudio?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      setIsSticky(true);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userId = `u_${crypto.randomUUID()}`;
      const assistantId = `a_${crypto.randomUUID()}`;

      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed, isAudio: opts?.isAudio, createdAt: new Date().toISOString() },
      ]);
      setInput("");
      setPending(true);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          steps: [],
          stepsCollapsed: false,
          startedAt: Date.now(),
          streaming: true,
          reveal: true,
        },
      ]);

      try {
        const res = await fetch("/api/builder/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            conversationId: conversationIdRef.current ?? undefined,
            isAudio: opts?.isAudio,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detalhe = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(detalhe?.error ?? `Erro ao contatar o construtor (${res.status})`);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setPending(false);
          return;
        }

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

            if (evt.type === "tool_call") {
              const step: ProgressStep = {
                id: evt.toolCallId ?? `s_${crypto.randomUUID()}`,
                label: evt.label,
                state: "running",
                raw: true,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, steps: [...(m.steps ?? []), step] } : m,
                ),
              );
            } else if (evt.type === "tool_result") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  let marked = false;
                  const steps = (m.steps ?? []).map((s) => {
                    if (marked || s.state !== "running") return s;
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
                justCreatedRef.current.add(evt.conversationId);
                onConversationCreated(evt.conversationId);
              }
              const doneAt = Date.now();
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const steps = (m.steps ?? []).map((s) => ({ ...s, state: "done" as const }));
                  return {
                    ...m,
                    content: evt.message,
                    streaming: false,
                    steps: steps.length > 0 ? steps : undefined,
                    stepsCollapsed: true,
                    startedAt: m.startedAt ?? doneAt,
                    doneAt,
                    durationMs: typeof evt.durationMs === "number" ? evt.durationMs : undefined,
                    createdAt: m.createdAt ?? new Date(doneAt).toISOString(),
                  };
                }),
              );
              onDone({
                ficha: evt.ficha ?? undefined,
                savedId: evt.savedId,
                etag: evt.etag,
                recusa: evt.recusa,
                bloqueado: evt.bloqueado,
              });
            } else if (evt.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `**Erro:** ${evt.error}`, streaming: false, steps: undefined }
                    : m,
                ),
              );
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `**Erro inesperado:** ${err instanceof Error ? err.message : String(err)}`,
                  streaming: false,
                }
              : m,
          ),
        );
      } finally {
        setPending(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId && m.streaming ? { ...m, streaming: false } : m)),
        );
      }
    },
    [pending, onConversationCreated, onDone, setIsSticky],
  );

  const handleClear = React.useCallback(async () => {
    setMenuOpen(false);
    const cid = conversationIdRef.current;
    if (cid) {
      const r = await arquivarBuilderConversaAction(cid);
      if (!r.ok) {
        toast.error(r.error ?? "Nao foi possivel limpar a conversa.");
        return;
      }
    }
    abortRef.current?.abort();
    setMessages([]);
    conversationIdRef.current = null;
    onCleared();
  }, [onCleared]);

  const handleExport = React.useCallback(async () => {
    setMenuOpen(false);
    const cid = conversationIdRef.current;
    if (!cid) {
      toast.info("Nada para baixar ainda. Faca pelo menos uma pergunta.");
      return;
    }
    const r = await exportarBuilderConversaTxt(cid);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const blob = new Blob([r.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Conversa baixada.");
  }, []);

  // Transcreve o audio e envia o texto como pergunta (igual ao Nex).
  const handleSendAudio = React.useCallback(
    async (blob: Blob) => {
      if (audioFlight) return;
      setAudioFlight(true);
      const transcribingId = "transcribing";
      setIsSticky(true);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== transcribingId),
        { id: transcribingId, role: "user", content: "", transcribing: true, createdAt: new Date().toISOString() },
      ]);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("language", "pt");
        const res = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d?.error ?? `HTTP ${res.status}`);
        }
        const d = (await res.json()) as { text?: string };
        const text = (d?.text ?? "").trim();
        setMessages((prev) => prev.filter((m) => m.id !== transcribingId));
        if (!text) {
          toast.error("Nao consegui entender o audio.");
          return;
        }
        void handleSend(text, { isAudio: true });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== transcribingId));
        toast.error(`Falha ao transcrever: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setAudioFlight(false);
      }
    },
    [audioFlight, handleSend, setIsSticky],
  );

  const sendDisabled = pending || input.trim().length === 0;
  const showWelcome = !restoring && messages.length === 0;
  const showRestoring = restoring && messages.length === 0;

  return (
    <div className="relative flex h-full flex-col bg-card">
      {/* Header com menu de 3 pontos */}
      <header className="relative z-40 flex items-center justify-between gap-2 border-b border-border bg-background/60 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
            <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            <span aria-hidden className="absolute right-0 bottom-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-card" />
          </div>
          <div>
            <h2 className="text-sm leading-tight font-semibold tracking-tight text-foreground">Agente Nex</h2>
            <p className="text-xs leading-tight text-muted-foreground">Construtor</p>
          </div>
        </div>
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label="Mais opcoes"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 z-10 mt-1.5 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {podeExportar ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleExport}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  Baixar conversa (.txt)
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={handleClear}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none",
                  podeExportar ? "border-t border-border/50" : "",
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar conversa
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Tag de data flutuante */}
      {!showWelcome && dateLabel ? (
        <div className="pointer-events-none absolute top-[58px] left-1/2 z-30 -translate-x-1/2">
          <span className="block rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-400/25 backdrop-blur-md dark:text-violet-200">
            <motion.span
              key={dateLabel}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="block whitespace-nowrap"
            >
              {dateLabel}
            </motion.span>
          </span>
        </div>
      ) : null}

      {/* Area de mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pt-[17px] pb-3">
        {showWelcome ? (
          <WelcomeBlock />
        ) : showRestoring ? (
          <RestoringBlock />
        ) : (
          <div ref={contentRef} className="space-y-4">
            {messages.map((m, idx) => {
              const durationMs =
                typeof m.durationMs === "number"
                  ? m.durationMs
                  : m.startedAt && m.doneAt
                    ? m.doneAt - m.startedAt
                    : undefined;
              return (
                <div
                  key={m.id}
                  ref={(el) => {
                    if (el) messageRefsMap.current.set(m.id, el);
                    else messageRefsMap.current.delete(m.id);
                  }}
                  className={idx === 0 ? "mt-[5px]" : undefined}
                >
                  <AgentMessage
                    role={m.role}
                    content={m.content}
                    kind={m.kind}
                    isAudio={m.isAudio}
                    transcribing={m.transcribing}
                    streaming={m.streaming}
                    reveal={m.reveal}
                    steps={m.steps}
                    stepsCollapsed={m.stepsCollapsed ?? true}
                    createdAt={m.createdAt}
                    durationMs={durationMs}
                    onRevealComplete={() =>
                      setMessages((prev) =>
                        prev.map((x) => (x.id === m.id ? { ...x, revealDone: true } : x)),
                      )
                    }
                    onToggleSteps={() => {
                      setIsSticky(false);
                      setMessages((prev) =>
                        prev.map((x) =>
                          x.id === m.id ? { ...x, stepsCollapsed: !(x.stepsCollapsed ?? true) } : x,
                        ),
                      );
                      requestAnimationFrame(() => {
                        const el = scrollRef.current;
                        if (el)
                          setShowScrollFab(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB voltar-pro-fim */}
      <button
        type="button"
        onClick={scrollToBottomNow}
        aria-label="Ir para o fim da conversa"
        aria-hidden={!(showScrollFab && !showWelcome)}
        tabIndex={showScrollFab && !showWelcome ? 0 : -1}
        className={cn(
          "pointer-events-auto absolute right-3 bottom-[88px] z-30 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full",
          "bg-violet-500/20 text-violet-700 shadow-sm ring-1 ring-violet-400/25 backdrop-blur-md dark:text-violet-200",
          "transition-all duration-200 hover:bg-violet-500/45 hover:text-white hover:ring-violet-400/50",
          "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
          showScrollFab && !showWelcome
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Composer (igual ao Nex) */}
      <footer className="border-t border-border bg-card px-3 pt-2 pb-3">
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
          <div className="min-w-0 flex-1">
            {!isRecording ? (
              <MessageInput
                value={input}
                onChange={setInput}
                onSend={() => void handleSend(input)}
                disabled={pending}
                placeholder="Construa com o Agente Nex…"
                aria-label="Mensagem para o construtor"
                maxRows={6}
                leftSlot={
                  anexoEnabled ? (
                    <AttachMenu
                      disabled={pending}
                      onPick={() => toast.info("Anexos no construtor chegam em breve.")}
                    />
                  ) : undefined
                }
                rightSlot={
                  audioEnabled && !audioFlight ? (
                    <button
                      type="button"
                      onClick={() => void recorderRef.current?.start()}
                      disabled={pending}
                      aria-label="Gravar audio"
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Mic className="h-4 w-4" aria-hidden />
                    </button>
                  ) : undefined
                }
              />
            ) : null}
            {audioEnabled ? (
              <div
                className={
                  isRecording
                    ? "flex min-h-9 items-center rounded-2xl border border-violet-500/40 bg-violet-500/5 px-3 py-1"
                    : "sr-only"
                }
                aria-hidden={!isRecording}
              >
                <AudioRecorder
                  ref={recorderRef}
                  mode="embedded"
                  onSend={(blob) => void handleSendAudio(blob)}
                  onRecordingStateChange={setIsRecording}
                />
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={isRecording ? false : sendDisabled || audioFlight}
            aria-label={isRecording ? "Enviar audio" : "Enviar"}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center self-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30 transition-all duration-200 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {audioFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </form>
        <p className={cn("mt-1.5 px-1 text-[11px] text-muted-foreground", isRecording ? "invisible" : "visible")}>
          Enter envia · Shift+Enter quebra linha
        </p>
      </footer>

      <style jsx global>{`
        @keyframes agentDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function WelcomeBlock() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
        <Sparkles className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-semibold text-foreground">Construa com o Agente Nex</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Descreva o relatorio que voce quer ver. Ex.: saldo de estoque por armazem, ou valor
          parado por familia.
        </p>
      </div>
    </div>
  );
}

function RestoringBlock() {
  return (
    <div className="space-y-4 pt-1" role="status" aria-label="Carregando conversa">
      <div className="flex justify-end">
        <div className="h-9 w-3/5 animate-pulse rounded-xl bg-violet-600/15" />
      </div>
      <div className="flex justify-start">
        <div className="h-16 w-4/5 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-9 w-2/5 animate-pulse rounded-xl bg-violet-600/15" />
      </div>
      <span className="sr-only">Carregando conversa…</span>
    </div>
  );
}
