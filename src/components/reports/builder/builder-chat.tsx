"use client";

// src/components/reports/builder/builder-chat.tsx
// F2a (v2) , Painel de conversa do construtor. Reusa a estetica da bolha do Nex
// (acento violeta, rounded-xl) e o AudioRecorder + /api/agent/transcribe para
// entrada por voz. Componente apresentacional: estado/orquestracao na pagina.
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Sparkles, Mic, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/agent/audio-recorder";

export interface BuilderChatMensagem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface BuilderChatProps {
  mensagens: BuilderChatMensagem[];
  pensando: boolean;
  onEnviar: (prompt: string) => void;
  desabilitado?: boolean;
  /** Quando true, mostra o microfone (modelo de audio configurado). */
  audioEnabled?: boolean;
}

export function BuilderChat({
  mensagens,
  pensando,
  onEnviar,
  desabilitado = false,
  audioEnabled = false,
}: BuilderChatProps) {
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [mensagens, pensando]);

  const podeEnviar = texto.trim().length > 0 && !pensando && !desabilitado;

  function enviar() {
    if (!podeEnviar) return;
    onEnviar(texto.trim());
    setTexto("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  async function transcrever(blob: Blob) {
    setTranscrevendo(true);
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
      const t = (d?.text ?? "").trim();
      if (!t) {
        toast.error("Nao consegui entender o audio.");
        return;
      }
      // Coloca no campo para o usuario revisar e enviar.
      setTexto((prev) => (prev ? `${prev} ${t}` : t));
    } catch (err) {
      toast.error(
        `Falha ao transcrever: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setTranscrevendo(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Trilha de mensagens */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {mensagens.length === 0 && !pensando ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Descreva o relatorio que voce quer
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ex.: saldo de estoque por armazem, ou valor parado por familia.
                {audioEnabled ? " Voce pode digitar ou falar." : ""} Eu monto e voce
                ve o resultado ao lado.
              </p>
            </div>
          </div>
        ) : null}

        {mensagens.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex w-full justify-end">
              <div className="w-fit max-w-[85%] rounded-xl rounded-br-sm bg-violet-600/15 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex w-full justify-start">
              <div className="w-fit max-w-[88%] rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {m.content}
              </div>
            </div>
          ),
        )}

        {pensando ? (
          <div
            className="flex w-full justify-start"
            data-testid="builder-pensando"
            aria-live="polite"
          >
            <div className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-3">
              <span className="sr-only">Montando o relatorio</span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500" />
            </div>
          </div>
        ) : null}

        <div ref={fimRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-400/30">
          {/* Barra de gravacao (visivel so gravando) ou textarea */}
          {audioEnabled && gravando ? (
            <div className="flex min-h-[36px] flex-1 items-center">
              <AudioRecorder
                ref={recorderRef}
                mode="embedded"
                onSend={(blob) => void transcrever(blob)}
                onRecordingStateChange={setGravando}
              />
            </div>
          ) : (
            <>
              {audioEnabled ? (
                <span className="sr-only" aria-hidden>
                  <AudioRecorder
                    ref={recorderRef}
                    mode="embedded"
                    onSend={(blob) => void transcrever(blob)}
                    onRecordingStateChange={setGravando}
                  />
                </span>
              ) : null}
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                disabled={desabilitado || transcrevendo}
                placeholder={
                  transcrevendo
                    ? "Transcrevendo seu audio..."
                    : "Descreva o relatorio (ex.: saldo por armazem)..."
                }
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </>
          )}

          {/* Microfone */}
          {audioEnabled && !gravando ? (
            <button
              type="button"
              onClick={() => recorderRef.current?.start()}
              disabled={desabilitado || transcrevendo || pensando}
              aria-label="Gravar audio"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {transcrevendo ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
            </button>
          ) : null}

          {/* Enviar (escondido enquanto grava) */}
          {!gravando ? (
            <button
              type="button"
              onClick={enviar}
              disabled={!podeEnviar}
              aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          Enter envia, Shift+Enter quebra linha
          {audioEnabled ? ", ou toque no microfone para falar." : "."}
        </p>
      </div>
    </div>
  );
}
