"use client";

// src/components/reports/builder/builder-preview.tsx
// F2b (v2) , Canvas de preview ao vivo. Valida a estrutura localmente (barato) e,
// quando valida, pede ao servidor a resolucao das secoes (previsualizarSecoes,
// sem persistir) e desenha via ReportRenderer numa "pagina" de relatorio sobre
// um fundo de canvas. E a area dominante da tela do construtor.
import { useState, useEffect } from "react";
import { LayoutDashboard, AlertTriangle, Eye, Maximize2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ReportRenderer, type EditavelFicha } from "./report-renderer";
import { CanvasViewport } from "./canvas-viewport";
import { previsualizarSecoes } from "@/lib/actions/builder";
import { validarReportEntry } from "@/lib/reports/builder/report-entry-schema";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

type EstadoPreview = "vazio" | "invalida" | "carregando" | "ok" | "erro";

function Moldura({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground/60 shadow-sm">
        {icon}
      </div>
      <div className="max-w-sm space-y-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function BuilderPreview({
  ficha,
  editavel,
}: {
  ficha: BuilderReportEntry | null;
  editavel?: EditavelFicha;
}) {
  const [estado, setEstado] = useState<EstadoPreview>("vazio");
  const [dados, setDados] = useState<Record<string, SecaoResolvida>>({});
  const [cheia, setCheia] = useState(false);

  // ESC fecha a tela cheia.
  useEffect(() => {
    if (!cheia) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCheia(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cheia]);

  useEffect(() => {
    if (!ficha) {
      setEstado("vazio");
      return;
    }
    const v = validarReportEntry(ficha);
    if (!v.ok || v.entry.secoes.length === 0) {
      setEstado("invalida");
      return;
    }
    let cancelado = false;
    setEstado("carregando");
    previsualizarSecoes(ficha)
      .then((r) => {
        if (cancelado) return;
        if (r.tipo === "ok") {
          setDados(r.dados);
          setEstado("ok");
        } else {
          setEstado(r.tipo === "invalida" ? "invalida" : "erro");
        }
      })
      .catch(() => {
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [ficha]);

  return (
    <div className="flex h-full flex-col">
      {/* Barra do canvas , altura fixa (h-11) casada com o header da Conversa
          para a linha divisoria dos dois lados ficar alinhada. */}
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-5 text-xs font-medium text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Pre-visualizacao
          {estado === "ok" && ficha ? (
            <span className="ml-1 truncate text-foreground">· {ficha.titulo}</span>
          ) : null}
        </div>
        {estado === "ok" && ficha ? (
          <button
            type="button"
            onClick={() => setCheia(true)}
            aria-label="Ver em tela cheia"
            title="Ver em tela cheia"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Canvas , quando ha relatorio, vira um canvas com zoom/pan; nos demais
          estados e uma area pontilhada centralizada. */}
      <div
        className={
          estado === "ok"
            ? "relative flex-1 overflow-hidden"
            : "relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px]"
        }
      >
        {estado === "vazio" ? (
          <Moldura icon={<LayoutDashboard className="h-8 w-8" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              O preview do relatorio aparece aqui
            </p>
            <p className="text-xs leading-relaxed">
              Converse com o construtor a esquerda. Conforme voce descreve o que
              quer, o relatorio vai sendo montado e renderizado nesta area.
            </p>
          </Moldura>
        ) : null}

        {estado === "invalida" ? (
          <Moldura icon={<AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              Ainda nao da para visualizar
            </p>
            <p className="text-xs leading-relaxed">
              O relatorio precisa de ao menos uma secao valida. Continue a conversa
              para completar.
            </p>
          </Moldura>
        ) : null}

        {estado === "erro" ? (
          <Moldura icon={<AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              Nao consegui montar o preview agora
            </p>
            <p className="text-xs leading-relaxed">
              Tente ajustar o pedido na conversa.
            </p>
          </Moldura>
        ) : null}

        {estado === "carregando" ? (
          <div className="mx-auto max-w-4xl p-6" aria-busy="true">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="h-7 w-2/5 animate-pulse rounded-lg bg-muted" />
              <div className="mt-2 h-4 w-3/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-5 h-56 w-full animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        ) : null}

        {estado === "ok" && ficha ? (
          <CanvasViewport>
            {/* "papel" do relatorio com largura logica fixa (BASE_WIDTH do canvas). */}
            <div className="px-5 pb-10">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <ReportRenderer entry={ficha} dados={dados} editavel={editavel} />
              </div>
            </div>
          </CanvasViewport>
        ) : null}
      </div>

      {/* Tela cheia: overlay com o relatorio rolavel. Fecha no X, clicar fora ou ESC. */}
      <AnimatePresence>
        {cheia && ficha ? (
          <>
            <motion.div
              key="tc-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setCheia(false)}
            />
            <motion.div
              key="tc-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Relatorio ${ficha.titulo} em tela cheia`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-50 m-auto flex h-[92vh] w-[95vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-5">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                  <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{ficha.titulo}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCheia(false)}
                  aria-label="Fechar tela cheia"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-background p-6">
                <div className="mx-auto max-w-6xl">
                  <ReportRenderer entry={ficha} dados={dados} />
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
