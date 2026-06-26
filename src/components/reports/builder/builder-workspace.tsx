"use client";

// src/components/reports/builder/builder-workspace.tsx
// F2c/F2d (v2) , Workspace do construtor em tela cheia: chat (painel lateral) +
// preview ao vivo (area dominante). Mantem o estado da conversa + ficha +
// rascunho salvo e liga tudo em construirRelatorio. "Abrir relatorio" navega
// para a rota dinamica depois que o rascunho foi persistido.
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileBarChart, MessagesSquare } from "lucide-react";
import { construirRelatorio } from "@/lib/actions/builder";
import { BuilderChat, type BuilderChatMensagem } from "./builder-chat";
import { BuilderPreview } from "./builder-preview";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

export function BuilderWorkspace({
  audioEnabled = false,
  anexoEnabled = false,
}: {
  audioEnabled?: boolean;
  anexoEnabled?: boolean;
}) {
  const router = useRouter();
  const seq = useRef(0);
  const [mensagens, setMensagens] = useState<BuilderChatMensagem[]>([]);
  const [ficha, setFicha] = useState<BuilderReportEntry | null>(null);
  const [pensando, setPensando] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | null>(null);

  function novoId() {
    seq.current += 1;
    return `m${seq.current}`;
  }

  function addMensagem(role: "user" | "assistant", content: string) {
    setMensagens((prev) => [...prev, { id: novoId(), role, content }]);
  }

  async function enviar(prompt: string) {
    addMensagem("user", prompt);
    setPensando(true);
    try {
      const r = await construirRelatorio({ prompt, fichaAtual: ficha, savedId, etag });
      if (r.ficha) setFicha(r.ficha);
      if (r.savedId) setSavedId(r.savedId);
      if (r.etag) setEtag(r.etag);
      addMensagem("assistant", r.mensagem || "Pronto.");
    } catch {
      addMensagem(
        "assistant",
        "Tive um problema ao montar o relatorio agora. Pode tentar de novo?",
      );
    } finally {
      setPensando(false);
    }
  }

  function abrir() {
    if (savedId) router.push(`/relatorios/d/${savedId}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Cabecalho */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
            <FileBarChart className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              Construtor de relatorios
            </h1>
            <p className="text-xs text-muted-foreground">
              Converse para montar o relatorio e veja o resultado ao lado.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={abrir}
          disabled={!savedId}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Abrir relatorio
        </button>
      </header>

      {/* Corpo: chat (lateral) + preview (dominante) */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border lg:h-auto lg:w-[400px] lg:border-r lg:border-b-0">
          <div className="flex items-center gap-1.5 border-b border-border px-5 py-2.5 text-xs font-medium text-muted-foreground">
            <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
            Conversa
          </div>
          <div className="min-h-[280px] flex-1 lg:min-h-0">
            <BuilderChat
              mensagens={mensagens}
              pensando={pensando}
              onEnviar={enviar}
              audioEnabled={audioEnabled}
              anexoEnabled={anexoEnabled}
            />
          </div>
        </aside>
        <section className="min-h-0 flex-1 bg-background">
          <BuilderPreview ficha={ficha} />
        </section>
      </div>
    </div>
  );
}
