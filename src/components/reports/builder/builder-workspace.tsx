"use client";

// src/components/reports/builder/builder-workspace.tsx
// F2c/F2d (v3 , chat = Nex) , Workspace do construtor: chat (painel lateral com
// a experiencia do Agente Nex) + preview ao vivo. O chat fala com
// /api/builder/stream e PERSISTE a conversa; a ficha do preview vem do `onDone`
// de cada turno. "Abrir relatorio" navega para a rota dinamica do SavedReport.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileBarChart, RefreshCw } from "lucide-react";
import {
  BuilderChatPanel,
  type BuilderDonePayload,
  type ProgressoGeracaoUi,
  type RoteiroUi,
} from "./builder-chat-panel";
import { BuilderPreview } from "./builder-preview";
import { RoteiroIndicador } from "./journey/roteiro-indicador";
import { GeracaoOverlay } from "./journey/geracao-overlay";
import { salvarFichaEditada } from "@/lib/actions/builder";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { FaseJornada, JourneyState } from "@/lib/reports/builder/journey/state";

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
  // Fase da jornada: relatorio ja salvo abre direto no refino (2-pane); conversa
  // nova comeca na entrevista (chat centralizado).
  const [fase, setFase] = useState<FaseJornada>(initialSavedId ? "refino" : "entrevista");
  // journeyState e guardado so para repassar entre turnos (nao lido na view).
  const [, setJourneyState] = useState<JourneyState | null>(null);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoGeracaoUi | null>(null);
  const [roteiro, setRoteiro] = useState<RoteiroUi | null>(null);
  const [omitidos, setOmitidos] = useState<string[]>([]);
  // Ampliar: esconde a conversa (relatorio ocupa tudo); X traz a conversa de volta.
  const [cheia, setCheia] = useState(false);
  // Ref do etag para o salvamento async da edicao ler sempre o valor atual.
  const etagRef = useRef<string | null>(initialEtag);
  // Handle de envio exposto pelo chat (Gerar e "ajustar e regenerar").
  const enviarRef = useRef<((text: string, opts?: { acao?: "gerar" | "regenerar" }) => void) | null>(null);

  // Gerar so fica disponivel quando o roteiro foi cumprido (gate por evidencia,
  // refletido no evento roteiro: respondidas >= total).
  const elegivel = !!roteiro && roteiro.respondidas >= roteiro.total;

  // Watchdog: a overlay NUNCA pode ficar travada. Se em ~110s nao chegou done nem
  // erro (conexao caiu, funcao cortada), fecha e avisa.
  useEffect(() => {
    if (!gerando) return;
    const id = window.setTimeout(() => {
      setGerando(false);
      setProgresso(null);
      toast.error("A geracao demorou demais. Tenta de novo, por favor.");
    }, 110_000);
    return () => window.clearTimeout(id);
  }, [gerando]);

  function aplicarDados(p: BuilderDonePayload) {
    if (p.ficha !== undefined && p.ficha !== null) setFicha(p.ficha);
    if (p.savedId) setSavedId(p.savedId);
    if (p.etag) {
      etagRef.current = p.etag;
      setEtag(p.etag);
    }
    if (p.journeyState) setJourneyState(p.journeyState);
  }

  function handleDone(p: BuilderDonePayload) {
    aplicarDados(p);
    if (p.omitidos) setOmitidos(p.omitidos);
    // Geracao bloqueada por quota (ou qualquer done sem ir pro refino): fecha a
    // overlay e segue na entrevista, sem travar.
    if (gerando && p.fase !== "refino") {
      setGerando(false);
      setProgresso(null);
      if (p.bloqueado) toast.info("Voce atingiu o limite de uso por agora. Tente de novo mais tarde.");
      if (p.fase) setFase(p.fase);
      return;
    }
    if (p.fase === "refino" && gerando) {
      // Dwell no 100% antes de revelar o 2-pane (transicao suave do reveal).
      setProgresso({ fase: "validacao", pct: 100, frase: "" });
      window.setTimeout(() => {
        setFase("refino");
        setGerando(false);
        setProgresso(null);
      }, 750);
      return;
    }
    if (p.fase) setFase(p.fase);
  }

  // Falha na geracao: nunca deixa a overlay travada , fecha e volta para a conversa.
  function handleGenError(mensagem: string) {
    setGerando(false);
    setProgresso(null);
    toast.error("Nao consegui montar agora. Me da mais um detalhe e tento de novo.");
    if (mensagem) console.warn("[geracao] falha:", mensagem);
  }

  function handleCleared() {
    setConversationId(null);
    setFicha(null);
    setSavedId(null);
    setEtag(null);
    setJourneyState(null);
    setFase("entrevista");
    setGerando(false);
    setProgresso(null);
    setRoteiro(null);
    setOmitidos([]);
  }

  function gerar() {
    setProgresso({ fase: "blueprint", pct: 2, frase: "" });
    setOmitidos([]);
    setGerando(true);
    enviarRef.current?.("Pode gerar o relatorio agora.", { acao: "gerar" });
  }

  function regenerar(texto: string) {
    setProgresso({ fase: "blueprint", pct: 2, frase: "" });
    setOmitidos([]);
    setGerando(true);
    enviarRef.current?.(texto, { acao: "regenerar" });
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
          onCor: (secaoId: string, cor: string | null) =>
            aplicarEdicao((f) => ({
              ...f,
              secoes: f.secoes.map((s) => {
                if (s.id !== secaoId) return s;
                const config = { ...s.config };
                if (cor) config.cor = cor;
                else delete config.cor;
                return { ...s, config };
              }),
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

  const chatPanel = (
    <BuilderChatPanel
      conversationId={conversationId}
      onConversationCreated={setConversationId}
      onCleared={handleCleared}
      onDone={handleDone}
      audioEnabled={audioEnabled}
      anexoEnabled={anexoEnabled}
      podeExportar={podeExportar}
      enviarRef={enviarRef}
      onProgress={setProgresso}
      onRoteiro={setRoteiro}
      onGenError={handleGenError}
      imersivo={fase !== "refino"}
    />
  );

  const overlay = gerando ? (
    <GeracaoOverlay pct={progresso?.pct ?? 0} fase={progresso?.fase} omitidos={omitidos} />
  ) : null;

  // REFINO: layout 2-painoes (chat lateral + preview) dentro do card do workspace.
  if (fase === "refino") {
    return (
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/40">
              <FileBarChart className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Construtor de relatorios</h1>
              <p className="text-xs text-muted-foreground">Converse para ajustar e veja o resultado ao lado.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => regenerar("Refaz o relatorio reaproveitando o que voce ja entendeu, melhorando o que der.")}
              disabled={gerando}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refazer
            </button>
            <button
              type="button"
              onClick={abrir}
              disabled={!savedId}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir relatorio
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Conversa: escondida no modo ampliado (cheia). */}
          {!cheia ? (
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border lg:h-auto lg:w-[400px] lg:border-r lg:border-b-0">
              <div className="min-h-[320px] flex-1 lg:min-h-0">{chatPanel}</div>
            </aside>
          ) : null}
          <section className="min-h-0 min-w-0 flex-1 bg-background">
            <BuilderPreview
              ficha={ficha}
              editavel={editavel}
              cheia={cheia}
              onToggleCheia={() => setCheia((v) => !v)}
            />
          </section>
        </div>
        {overlay}
      </div>
    );
  }

  // ENTREVISTA: tela LIMPA e IMERSIVA (uma superficie so). No topo, o indicador do
  // roteiro (X de N). O Gerar so aparece quando a IA cobriu o necessario (elegivel).
  // Clicar Gerar roda o pipeline nos bastidores -> overlay -> transiciona pro refino.
  const temConversa = !!conversationId || !!roteiro;
  return (
    <div className="relative flex h-full flex-col bg-background">
      {temConversa && roteiro && !elegivel ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-30 px-4">
          <RoteiroIndicador total={roteiro.total} respondidas={roteiro.respondidas} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">{chatPanel}</div>

      {/* Gerar escondido ate elegivel. Aparece com micro-animacao acima do composer. */}
      {elegivel && !gerando ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[92px] z-30">
          <div className="mx-auto flex w-full max-w-2xl justify-center px-4">
            <button
              type="button"
              onClick={gerar}
              className="pointer-events-auto flex animate-[fadeInUp_0.3s_ease-out] cursor-pointer items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
            >
              <FileBarChart className="h-4 w-4" aria-hidden />
              Gerar relatorio
            </button>
          </div>
        </div>
      ) : null}

      {overlay}

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
