"use client";

// src/components/reports/builder/builder-chat.tsx
// F2a (v3) , Painel de conversa do construtor com o MESMO composer da bubble do
// Nex: reusa MessageInput (input sutil de 1 linha) + AttachMenu (anexo
// imagem/arquivo) + AudioRecorder persistente (1 instancia, grava de verdade) +
// botao de enviar arredondado. Estetica e comportamento iguais ao Nex.
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Mic, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { MessageInput } from "@/components/agent/message-input";
import { AttachMenu } from "@/components/agent/attach-menu";
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
  /** Mostra o microfone (modelo de audio configurado). */
  audioEnabled?: boolean;
  /** Mostra o anexo (entrada de imagem/arquivo configurada). */
  anexoEnabled?: boolean;
}

export function BuilderChat({
  mensagens,
  pensando,
  onEnviar,
  desabilitado = false,
  audioEnabled = false,
  anexoEnabled = false,
}: BuilderChatProps) {
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [anexos, setAnexos] = useState<{ nome: string; kind: "image" | "file" }[]>([]);
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
    setAnexos([]);
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
                Construa com o agente Nex
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Descreva o relatorio que voce quer ver. Ex.: saldo de estoque por
                armazem, ou valor parado por familia.
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

      {/* Composer (igual ao Nex) */}
      <footer className="border-t border-border bg-card px-3 pt-2 pb-3">
        {/* Anexos staged */}
        {anexos.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {anexos.map((a, i) => (
              <span
                key={`${a.nome}-${i}`}
                className="flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] text-foreground"
              >
                {a.nome}
                <button
                  type="button"
                  onClick={() => setAnexos((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remover ${a.nome}`}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (gravando) {
              recorderRef.current?.sendNow();
              return;
            }
            enviar();
          }}
          className="flex items-center gap-2"
        >
          <div className="min-w-0 flex-1">
            {!gravando ? (
              <MessageInput
                value={texto}
                onChange={setTexto}
                onSend={enviar}
                disabled={desabilitado || transcrevendo}
                placeholder={
                  transcrevendo ? "Transcrevendo seu audio…" : "Construa com o agente Nex…"
                }
                aria-label="Mensagem para o construtor"
                maxRows={6}
                leftSlot={
                  anexoEnabled ? (
                    <AttachMenu
                      disabled={desabilitado || pensando}
                      onPick={(file, kind) =>
                        setAnexos((prev) => [...prev, { nome: file.name, kind }])
                      }
                    />
                  ) : undefined
                }
                rightSlot={
                  audioEnabled ? (
                    <button
                      type="button"
                      onClick={() => void recorderRef.current?.start()}
                      disabled={transcrevendo || pensando}
                      aria-label="Gravar audio"
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {transcrevendo ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Mic className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  ) : undefined
                }
              />
            ) : null}

            {/* AudioRecorder ÚNICO e persistente: sr-only quando idle, barra de
                gravacao com waveform quando ativo (mesma instancia , evita o mic
                que nao grava). */}
            {audioEnabled ? (
              <div
                className={
                  gravando
                    ? "flex min-h-9 items-center rounded-2xl border border-violet-500/40 bg-violet-500/5 px-3 py-1"
                    : "sr-only"
                }
                aria-hidden={!gravando}
              >
                <AudioRecorder
                  ref={recorderRef}
                  mode="embedded"
                  onSend={(blob) => void transcrever(blob)}
                  onRecordingStateChange={setGravando}
                />
              </div>
            ) : null}
          </div>

          {/* Enviar (arredondado, fora do input) */}
          <button
            type="submit"
            disabled={gravando ? false : !podeEnviar}
            aria-label={gravando ? "Enviar audio" : "Enviar"}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center self-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30 transition-all duration-200 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          Enter envia · Shift+Enter quebra linha
        </p>
      </footer>
    </div>
  );
}
