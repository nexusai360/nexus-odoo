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
import { MoreVertical, Send, Sparkles, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AgentMessage, type AgentMessageRole } from "./agent-message";
import { SuggestionsBar } from "./suggestions-bar";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** Quando true exibe botão de gravação de áudio (Task 3.3c). */
  audioInputEnabled?: boolean;
  /** conversationId atual (null = novo). Após primeira msg, recebe o id criado. */
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
}

interface UiMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  toolName?: string;
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
  | { type: "tool_call"; toolName: string }
  | { type: "tool_result"; toolName: string; truncated: boolean }
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
  conversationId: externalConvId,
  onConversationCreated,
}: ChatPanelProps) {
  const reduceMotion = useReducedMotion();

  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const conversationIdRef = React.useRef<string | null>(externalConvId ?? null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Sync external conversationId
  React.useEffect(() => {
    conversationIdRef.current = externalConvId ?? null;
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsgId = `u_${Date.now()}`;
      const assistantMsgId = `a_${Date.now()}`;

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
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setMessages((prev) => prev.filter((m) => m.id !== "loading"));
          toast.error(`Erro ao contatar o agente (${res.status})`);
          setPending(false);
          return;
        }

        // Remove loading e prepara a bolha de streaming
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== "loading"),
          { id: assistantMsgId, role: "assistant", content: "", streaming: true },
        ]);

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
              // thinking → já temos a loading bubble → noop
            } else if (evt.type === "token") {
              // Streaming token-a-token (Anthropic)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + evt.delta }
                    : m,
                ),
              );
            } else if (evt.type === "tool_call") {
              // Insere ToolBubble antes do assistantMsg
              const toolId = `t_${Date.now()}_${Math.random()}`;
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const copy = [...prev];
                copy.splice(idx, 0, {
                  id: toolId,
                  role: "tool",
                  content: "",
                  toolName: evt.toolName,
                });
                return copy;
              });
            } else if (evt.type === "done") {
              if (evt.conversationId && !conversationIdRef.current) {
                conversationIdRef.current = evt.conversationId;
                onConversationCreated?.(evt.conversationId);
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: evt.message,
                        suggestions: evt.suggestions,
                        streaming: false,
                      }
                    : m,
                ),
              );
            } else if (evt.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: `**Erro:** ${evt.error}`,
                        streaming: false,
                      }
                    : m,
                ),
              );
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
        // Garante que streaming=false na mensagem final
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && m.streaming ? { ...m, streaming: false } : m,
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
      void handleSend(suggestion);
    },
    [handleSend],
  );

  const handleClear = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setMenuOpen(false);
    conversationIdRef.current = null;
  }, []);

  const sendDisabled = pending || input.trim().length === 0;

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 28 };

  const showWelcome = messages.length === 0;

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
          "inset-0 rounded-none border-0",
          "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[70vh] sm:max-h-[640px] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border",
        )}
      >
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
                Agente
              </h2>
              <p className="text-xs leading-tight text-muted-foreground">
                Online · pergunte sobre a operação
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
            <WelcomeBlock onPick={handleSend} suggestions={WELCOME_SUGGESTIONS} />
          ) : (
            <div className="space-y-3">
              {messages.map((m, idx) => {
                const isLastAssistant =
                  m.role === "assistant" && idx === messages.length - 1 && !pending;
                return (
                  <React.Fragment key={m.id}>
                    <AgentMessage
                      role={m.role}
                      content={m.content}
                      toolName={m.toolName}
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

        {/* Input bar */}
        <footer className="border-t border-border bg-background/60 px-3 pt-3 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend(input);
            }}
            className="flex items-end gap-2"
          >
            <div
              className={cn(
                "flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors",
                "focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-400/30",
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                disabled={pending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend(input);
                  }
                }}
                rows={1}
                placeholder="Pergunte algo sobre a operação…"
                aria-label="Mensagem para o Agente"
                className={cn(
                  "flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
                  "max-h-28 outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
            </div>

            <button
              type="submit"
              aria-label="Enviar pergunta"
              disabled={sendDisabled}
              className={cn(
                "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
                "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
                "transition-all duration-200 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
                "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              <Send className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </form>
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Enter envia · Shift+Enter quebra linha
          </p>
        </footer>
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
        Olá, sou o Agente.
      </h3>
      <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
        Pergunte sobre vendas, estoque, finanças e operação. Consulto o banco em tempo real.
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
