"use client";

/**
 * ChatPanel — painel de chat do agente nexus-odoo.
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
import { Loader2, LogOut, Mic, MoreVertical, Send, Sparkles, Trash2, X } from "lucide-react";
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
}

interface UiMessage {
  id: string;
  /** "progress" é a trilha de consultas do turno (ProgressTrail). */
  role: AgentMessageRole | "progress";
  content: string;
  /** Passos da trilha de progresso (apenas para role "progress"). */
  steps?: ProgressStep[];
  kind?: "text" | "audio";
  audioBlobUrl?: string | null;
  durationSeconds?: number;
  suggestions?: string[];
  /** True enquanto este turn está sendo streamado. */
  streaming?: boolean;
}

type SseEvent =
  | { type: "status"; status: string }
  | { type: "token"; delta: string }
  | { type: "tool_call"; label: string; toolName?: string; toolCallId?: string }
  | { type: "tool_result"; label: string; truncated: boolean; toolName?: string; toolCallId?: string }
  | { type: "done"; conversationId: string; message: string; suggestions: string[] }
  | { type: "error"; error: string };

const WELCOME_SUGGESTIONS = [
  "Quanto vendemos este mês?",
  "Qual o saldo atual de estoque?",
  "Mostre os lançamentos financeiros recentes.",
];

export function ChatPanel({
  open,
  onClose,
  audioInputEnabled = false,
  imageInputEnabled = false,
  conversationId: externalConvId,
  onConversationCreated,
  onEndSession,
}: ChatPanelProps) {
  const reduceMotion = useReducedMotion();

  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [audioFlight, setAudioFlight] = React.useState(false);

  const conversationIdRef = React.useRef<string | null>(externalConvId ?? null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const recorderRef = React.useRef<AudioRecorderHandle | null>(null);

  // Sync external conversationId + carrega histórico do servidor
  React.useEffect(() => {
    conversationIdRef.current = externalConvId ?? null;

    if (!externalConvId) {
      // Nova conversa: limpa mensagens
      setMessages([]);
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
        .filter((m) => m.role !== "tool") // esconde mensagens de tool do usuário
        .map((m) => ({
          id: m.id,
          role: m.role as AgentMessageRole,
          content: m.content,
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

  // Auto-scroll
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSend = React.useCallback(
    async (text: string, opts?: { source?: "bubble" | "suggestion" }) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsgId = `u_${crypto.randomUUID()}`;
      const assistantMsgId = `a_${crypto.randomUUID()}`;
      const progressMsgId = `p_${crypto.randomUUID()}`;

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: trimmed },
      ]);
      setInput("");
      setPending(true);

      // Adiciona loading bubble
      setMessages((prev) => [
        ...prev,
        { id: "loading", role: "loading", content: "" },
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
        // done/error). Até lá fica a loading bubble ou a trilha de progresso —
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
              // Usa toolCallId do provider para correlacionar com tool_result.
              // Fallback FIFO permanece para providers que nao expoem id.
              const step: ProgressStep = {
                id: evt.toolCallId ?? `s_${crypto.randomUUID()}`,
                label: evt.label,
                state: "running",
              };
              setMessages((prev) => {
                if (prev.some((m) => m.id === progressMsgId)) {
                  return prev.map((m) =>
                    m.id === progressMsgId
                      ? { ...m, steps: [...(m.steps ?? []), step] }
                      : m,
                  );
                }
                // Trilha entra antes da bolha do assistente, se ela já existir.
                const base = dropLoading(prev);
                const progressMsg: UiMessage = {
                  id: progressMsgId,
                  role: "progress",
                  content: "",
                  steps: [step],
                };
                const idx = base.findIndex((m) => m.id === assistantMsgId);
                if (idx === -1) return [...base, progressMsg];
                const copy = [...base];
                copy.splice(idx, 0, progressMsg);
                return copy;
              });
            } else if (evt.type === "tool_result") {
              // Matching por toolCallId quando disponivel; FIFO label como
              // fallback (compat com providers sem id de correlacao).
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== progressMsgId) return m;
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
                onConversationCreated?.(evt.conversationId);
              }
              setMessages((prev) => {
                const finalized = dropLoading(prev).map((m) => {
                  if (m.id === progressMsgId) {
                    return {
                      ...m,
                      steps: (m.steps ?? []).map((s) => ({
                        ...s,
                        state: "done" as const,
                      })),
                    };
                  }
                  if (m.id === assistantMsgId) {
                    return {
                      ...m,
                      content: evt.message,
                      suggestions: evt.suggestions,
                      streaming: false,
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
                    suggestions: evt.suggestions,
                    streaming: false,
                  },
                ];
              });
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

        {/* Área de mensagens */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        >
          {showWelcome ? (
            <WelcomeBlock
              onPick={(s) => void handleSend(s, { source: "suggestion" })}
              suggestions={WELCOME_SUGGESTIONS}
            />
          ) : (
            <div className="space-y-3">
              {messages.map((m, idx) => {
                if (m.role === "progress") {
                  return <ProgressTrail key={m.id} steps={m.steps ?? []} />;
                }
                const isLastAssistant =
                  m.role === "assistant" && idx === messages.length - 1 && !pending;
                return (
                  <React.Fragment key={m.id}>
                    <AgentMessage
                      role={m.role}
                      content={m.content}
                      kind={m.kind}
                      audioBlobUrl={m.audioBlobUrl}
                      durationSeconds={m.durationSeconds}
                      streaming={m.streaming}
                    />
                    {isLastAssistant && m.suggestions && m.suggestions.length > 0 && (
                      <SuggestionsBar
                        suggestions={m.suggestions}
                        onPick={(s) => handlePickSuggestion(m.id, s)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Input bar (G4 + D8) — anexo à esquerda, mic à direita, enviar fora */}
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
