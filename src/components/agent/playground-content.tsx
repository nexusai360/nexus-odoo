"use client";

/**
 * PlaygroundContent — Playground do agente como PÁGINA (não Sheet — SPEC §8.3).
 *
 * Task 5.3 (Onda 5, F5).
 * Portado e adaptado de nexus-insights/src/components/agente-nex/playground-sheet.tsx.
 *
 * Diferenças do original (Sheet):
 * - Renderiza como página completa (layout 2 colunas: config header + área de chat).
 * - Persiste conversa em Postgres via SSE /api/agent/stream com isPlayground=true
 *   (channel=playground, isPlayground=true em LlmUsage — BUG 7).
 * - Histórico não efêmero: usa conversationId persistido entre reloads.
 * - "Ver prompt usado" abre Dialog em z-[70].
 * - Botão "Nova sessão" reseta a conversa (cria nova com channel=playground).
 * - audioEnabled: Whisper só com OpenAI (mesmo gating da bubble).
 *
 * Gate: super_admin | admin (SPEC §8.3).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §3 e §10
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eraser, Eye, Loader2, MessageSquare, Mic, Send } from "lucide-react";
import { toast } from "sonner";

import { AgentMessage, type AgentMessageRole } from "@/components/agent/agent-message";
import { SuggestionsBar } from "@/components/agent/suggestions-bar";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/agent/audio-recorder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

const MAX_INPUT_LEN = 1000;
const MAX_HISTORY = 40; // mais que o Sheet (20) — é página, não painel lateral

interface UiMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  toolName?: string;
  suggestions?: string[];
  streaming?: boolean;
}

function genId(): string {
  return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlaygroundContentProps {
  /** Provider ativo — usado para gating de áudio (Whisper só OpenAI). */
  providerKey: string | null;
  /** Label legível do provider (ex.: "OpenAI"). */
  providerLabel?: string;
  /** Label legível do modelo (ex.: "GPT-5.4"). */
  modelLabel?: string;
  /** Se áudio está habilitado nas configurações do agente. */
  audioInputEnabled?: boolean;
  /** userId do usuário logado. */
  userId: string;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PlaygroundContent({
  providerKey,
  providerLabel,
  modelLabel,
  audioInputEnabled,
  userId: _userId,
}: PlaygroundContentProps) {
  const prefersReducedMotion = useReducedMotion();

  const [items, setItems] = useState<UiMessage[]>([]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPreviewLoading, startPreview] = useTransition();
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");

  // Áudio
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioFlight, setAudioFlight] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const trimmed = message.trim();
  const overLimit = message.length > MAX_INPUT_LEN;
  const canSubmit = trimmed.length > 0 && !overLimit && !isSending && !isPreviewLoading;

  // Gating de áudio: só OpenAI tem Whisper
  const audioEnabled = audioInputEnabled && providerKey === "openai";

  const headerLabel = [
    "Playground",
    providerLabel,
    modelLabel,
  ].filter(Boolean).join(" · ");

  // Auto-scroll ao receber mensagem nova
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const appendItems = useCallback((next: UiMessage[]) => {
    setItems((prev) => {
      const combined = [...prev, ...next];
      if (combined.length <= MAX_HISTORY) return combined;
      return combined.slice(combined.length - MAX_HISTORY);
    });
  }, []);

  const updateLastAssistant = useCallback((updater: (msg: UiMessage) => UiMessage) => {
    setItems((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      const next = [...prev];
      next[realIdx] = updater(next[realIdx]!);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Submit via SSE
  // ---------------------------------------------------------------------------

  async function submitMessage(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText || isSending) return;
    if (trimmedText.length > MAX_INPUT_LEN) {
      toast.error(`Mensagem acima de ${MAX_INPUT_LEN} chars.`);
      return;
    }

    const userItem: UiMessage = { id: genId(), role: "user", content: trimmedText };
    appendItems([userItem]);
    setMessage("");
    setIsSending(true);

    // Placeholder assistant
    const assistantId = genId();
    appendItems([{ id: assistantId, role: "loading" as AgentMessageRole, content: "" }]);

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedText,
          conversationId,
          isPlayground: true,
          channel: "playground",
        }),
      });

      if (!res.ok || !res.body) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSuggestions: string[] = [];

      // Troca o placeholder por uma mensagem em streaming
      setItems((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, role: "assistant" as AgentMessageRole, content: "", streaming: true } : m,
        ),
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (evt.type === "status" && evt.status === "thinking") {
            // já está em loading — nada
          } else if (evt.type === "token") {
            updateLastAssistant((m) => ({
              ...m,
              content: m.content + String(evt.delta ?? ""),
              streaming: true,
            }));
          } else if (evt.type === "tool_call") {
            appendItems([{
              id: genId(),
              role: "tool_call" as AgentMessageRole,
              content: "",
              toolName: String(evt.toolName ?? ""),
            }]);
          } else if (evt.type === "done") {
            const convId = evt.conversationId;
            if (typeof convId === "string") setConversationId(convId);
            const suggestions = Array.isArray(evt.suggestions) ? (evt.suggestions as string[]) : [];
            finalSuggestions = suggestions;
            updateLastAssistant((m) => ({
              ...m,
              content: String(evt.message ?? m.content),
              streaming: false,
              suggestions: finalSuggestions.length > 0 ? finalSuggestions : undefined,
            }));
          } else if (evt.type === "error") {
            throw new Error(String(evt.error ?? "Erro do agente"));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro: ${msg}. Verifique a configuração do agente.`);
      // Remove o placeholder se ainda estiver lá
      setItems((prev) => prev.filter((m) => !(m.id === assistantId && m.role === "loading")));
    } finally {
      setIsSending(false);
      updateLastAssistant((m) => ({ ...m, streaming: false }));
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handlePickSuggestion = useCallback((msgId: string, suggestion: string) => {
    setItems((prev) => prev.map((m) => m.id === msgId ? { ...m, suggestions: undefined } : m));
    void submitMessage(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSendClick() {
    if (isRecording) { recorderRef.current?.sendNow(); return; }
    void submitMessage(message);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && !isPreviewLoading && !audioFlight) void submitMessage(message);
    }
  }

  function handleClearHistory() {
    setItems([]);
    setMessage("");
    setConversationId(null); // nova sessão = nova conversa
  }

  async function handleSendAudio(blob: Blob) {
    if (audioFlight) return;
    setAudioFlight(true);
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
      if (!text) { toast.error("Não conseguimos entender o áudio."); return; }
      void submitMessage(text);
    } catch (err) {
      toast.error(`Falha ao transcrever: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAudioFlight(false);
    }
  }

  function handleOpenPreview() {
    startPreview(async () => {
      try {
        const res = await fetch("/api/agent/prompt-preview", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          setPreviewText("Visualização do prompt não disponível. Verifique as permissões.");
          setPreviewOpen(true);
          return;
        }
        const data = (await res.json()) as { composedPrompt?: string };
        setPreviewText(data.composedPrompt ?? "Prompt não disponível.");
        setPreviewOpen(true);
      } catch {
        setPreviewText("Erro ao carregar o prompt. Verifique a configuração do agente.");
        setPreviewOpen(true);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-[calc(100vh-64px-4rem)] flex-col rounded-2xl border border-border bg-background shadow-sm"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
          <span className="truncate text-sm font-medium">{headerLabel}</span>
          {conversationId && (
            <span className="ml-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
              persistido
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleClearHistory}
            disabled={items.length === 0 || isSending}
            className="h-8 cursor-pointer text-xs"
          >
            <Eraser className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Nova sessão
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleOpenPreview}
            disabled={isPreviewLoading}
            className="h-8 cursor-pointer text-xs"
          >
            {isPreviewLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Ver prompt usado
          </Button>
        </div>
      </div>

      {/* Área de mensagens */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        aria-live="polite"
        aria-label="Conversa do playground"
      >
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Comece uma conversa de teste</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Conversas são salvas com <code className="rounded bg-muted px-1 text-[10px]">channel=playground</code>{" "}
                e marcadas em consumo. Use &quot;Nova sessão&quot; para limpar.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const isLastAssistant =
                item.role === "assistant" && idx === items.length - 1 && !isSending;
              return (
                <React.Fragment key={item.id}>
                  <AgentMessage
                    role={item.role}
                    content={item.content}
                    toolName={item.toolName}
                    streaming={item.streaming}
                  />
                  {isLastAssistant && item.suggestions && item.suggestions.length > 0 ? (
                    <SuggestionsBar
                      suggestions={item.suggestions}
                      onPick={(s) => handlePickSuggestion(item.id, s)}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
            {isSending && items.at(-1)?.role !== "loading" ? (
              <AgentMessage role="loading" content="" />
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Footer — input bar */}
      <footer className="shrink-0 border-t border-border bg-background/80 px-4 pb-4 pt-3 backdrop-blur-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSendClick(); }}
          className="flex items-end gap-2"
        >
          {/* Mic externo — só em idle */}
          {audioEnabled && !isRecording && !audioFlight ? (
            <button
              type="button"
              onClick={() => { void recorderRef.current?.start(); }}
              aria-label="Gravar áudio"
              className={cn(
                "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          ) : null}

          {/* Inner area — Textarea ou AudioRecorder */}
          <div className={cn(
            "flex min-h-9 flex-1 items-center rounded-xl border border-input bg-background px-3 py-1 transition-colors",
            "focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-400/30",
          )}>
            {!isRecording ? (
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                maxLength={MAX_INPUT_LEN}
                rows={1}
                placeholder="Pergunte ao agente…"
                disabled={isSending}
                aria-label="Mensagem para o agente"
                className="resize-none border-0 bg-transparent px-0 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0 max-h-28"
              />
            ) : null}
            {audioEnabled ? (
              <AudioRecorder
                ref={recorderRef}
                mode="embedded"
                onSend={(blob) => { void handleSendAudio(blob); }}
                onRecordingStateChange={setIsRecording}
              />
            ) : null}
          </div>

          {/* Botão Send */}
          <button
            type="submit"
            aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
            disabled={isRecording ? false : !canSubmit || audioFlight}
            className={cn(
              "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
              "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
              "transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
            )}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        </form>
        <p className={cn(
          "mt-1.5 px-1 text-[11px] text-muted-foreground transition-opacity",
          isRecording ? "invisible" : "visible",
        )}>
          Enter envia · Shift+Enter quebra linha
        </p>
      </footer>

      {/* Dialog "Ver prompt usado" */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl z-[70]" aria-label="Prompt do agente">
          <DialogHeader>
            <DialogTitle>Prompt usado nesta sessão</DialogTitle>
            <DialogDescription>
              System prompt composto a partir da configuração ativa do agente.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-muted/40">
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
              {previewText}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
