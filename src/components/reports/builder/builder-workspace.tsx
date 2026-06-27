"use client";

// src/components/reports/builder/builder-workspace.tsx
// F2c/F2d (v3 , chat = Nex) , Workspace do construtor: chat (painel lateral com
// a experiencia do Agente Nex) + preview ao vivo. O chat fala com
// /api/builder/stream e PERSISTE a conversa; a ficha do preview vem do `onDone`
// de cada turno. "Abrir relatorio" navega para a rota dinamica do SavedReport.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileBarChart } from "lucide-react";
import { BuilderChatPanel, type BuilderDonePayload } from "./builder-chat-panel";
import { BuilderPreview } from "./builder-preview";
import { salvarFichaEditada } from "@/lib/actions/builder";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

export function BuilderWorkspace({
  audioEnabled = false,
  anexoEnabled = false,
  podeExportar = false,
  initialConversationId = null,
  initialFicha = null,
  initialSavedId = null,
  initialEtag = null,
}: {
  audioEnabled?: boolean;
  anexoEnabled?: boolean;
  podeExportar?: boolean;
  initialConversationId?: string | null;
  initialFicha?: BuilderReportEntry | null;
  initialSavedId?: string | null;
  initialEtag?: string | null;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [ficha, setFicha] = useState<BuilderReportEntry | null>(initialFicha);
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const [, setEtag] = useState<string | null>(initialEtag);
  // Ref do etag para o salvamento async da edicao ler sempre o valor atual.
  const etagRef = useRef<string | null>(initialEtag);

  function handleDone(p: BuilderDonePayload) {
    if (p.ficha !== undefined && p.ficha !== null) setFicha(p.ficha);
    if (p.savedId) setSavedId(p.savedId);
    if (p.etag) {
      etagRef.current = p.etag;
      setEtag(p.etag);
    }
  }

  function handleCleared() {
    setConversationId(null);
    setFicha(null);
    setSavedId(null);
    setEtag(null);
  }

  function abrir() {
    if (savedId) router.push(`/relatorios-2/d/${savedId}`);
  }

  // Edicao da ficha pela UI (reordenar/remover/renomear secao): aplica no estado
  // e persiste (atualiza o etag). So habilita quando ha rascunho salvo.
  const editavel =
    ficha && savedId
      ? {
          onMover: (secaoId: string, dir: "cima" | "baixo") =>
            aplicarEdicao((f) => {
              const idx = f.secoes.findIndex((s) => s.id === secaoId);
              const alvo = dir === "cima" ? idx - 1 : idx + 1;
              if (idx < 0 || alvo < 0 || alvo >= f.secoes.length) return f;
              const secoes = [...f.secoes];
              const [s] = secoes.splice(idx, 1);
              secoes.splice(alvo, 0, s);
              return { ...f, secoes };
            }),
          onRemover: (secaoId: string) =>
            aplicarEdicao((f) => ({ ...f, secoes: f.secoes.filter((s) => s.id !== secaoId) })),
          onRenomear: (secaoId: string, titulo: string) =>
            aplicarEdicao((f) => ({
              ...f,
              secoes: f.secoes.map((s) =>
                s.id === secaoId ? { ...s, config: { ...s.config, titulo } } : s,
              ),
            })),
        }
      : undefined;

  function aplicarEdicao(fn: (f: BuilderReportEntry) => BuilderReportEntry) {
    setFicha((atual) => {
      if (!atual) return atual;
      const nova = fn(atual);
      const id = savedId;
      void (async () => {
        if (!id) return;
        const r = await salvarFichaEditada(id, etagRef.current ?? "", nova);
        if (r.ok) {
          etagRef.current = r.etag;
          setEtag(r.etag);
        }
      })();
      return nova;
    });
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
            <h1 className="text-sm font-semibold text-foreground">Construtor de relatorios</h1>
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
          <div className="min-h-[320px] flex-1 lg:min-h-0">
            <BuilderChatPanel
              conversationId={conversationId}
              onConversationCreated={setConversationId}
              onCleared={handleCleared}
              onDone={handleDone}
              audioEnabled={audioEnabled}
              anexoEnabled={anexoEnabled}
              podeExportar={podeExportar}
            />
          </div>
        </aside>
        {/* min-w-0: deixa a coluna do preview ENCOLHER abaixo da largura do
            conteudo (o canvas mede 1040px). Sem isso o flex-1 nao encolhe e o
            canvas le uma largura grande demais, abrindo o relatorio sem fit. */}
        <section className="min-h-0 min-w-0 flex-1 bg-background">
          <BuilderPreview ficha={ficha} editavel={editavel} />
        </section>
      </div>
    </div>
  );
}
