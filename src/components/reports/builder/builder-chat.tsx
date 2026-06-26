"use client";

// src/components/reports/builder/builder-chat.tsx
// F2a , Casca de chat propria do construtor de relatorios. Reusa a estetica da
// bolha do Nex (acento violeta, rounded-xl, bg-muted) sem arrastar o ChatPanel
// inteiro (audio/steps/feedback nao se aplicam aqui). Componente apresentacional:
// estado e orquestracao vivem na pagina (F2c).
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";

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
}

export function BuilderChat({
  mensagens,
  pensando,
  onEnviar,
  desabilitado = false,
}: BuilderChatProps) {
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  // Rola para a ultima mensagem / animacao de pensando.
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

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Trilha de mensagens */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {mensagens.length === 0 && !pensando ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Descreva o relatorio que voce quer
              </p>
              <p className="text-xs text-muted-foreground">
                Por exemplo: saldo de estoque por armazem, ou valor parado por familia.
                Eu monto a tabela e voce ve o resultado ao lado.
              </p>
            </div>
          </div>
        ) : null}

        {mensagens.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex w-full justify-end">
              <div className="w-fit max-w-[80%] rounded-xl bg-violet-600/15 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex w-full justify-start">
              <div className="w-fit max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
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
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={desabilitado}
            placeholder="Descreva o relatorio (ex.: saldo por armazem)..."
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!podeEnviar}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          Enter envia, Shift+Enter quebra linha.
        </p>
      </div>
    </div>
  );
}
