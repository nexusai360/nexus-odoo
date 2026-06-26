"use client";

// src/components/reports/builder/canvas-viewport.tsx
// F6 , Canvas infinito do preview do construtor (estilo Figma/mapa mental):
// - fit-to-width por padrao (o relatorio inteiro cabe na largura, sem cortar);
// - zoom com os botoes OU ctrl/cmd + scroll (centrado no cursor);
// - pan arrastando o fundo OU com o scroll (sem ctrl);
// - botao "ajustar" reenquadra. O conteudo tem largura fixa (BASE_WIDTH) para o
//   calculo de enquadramento ser deterministico.
import * as React from "react";
import { Minus, Plus, Maximize, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

/** Largura logica do "papel" do relatorio (antes do zoom). */
const BASE_WIDTH = 1040;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAD_TOP = 24;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

export function CanvasViewport({ children }: { children: React.ReactNode }) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [t, setT] = React.useState<Transform>({ scale: 1, tx: 0, ty: PAD_TOP });
  const tRef = React.useRef(t);
  React.useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [arrastando, setArrastando] = React.useState(false);

  // Enquadra: escala para a largura caber e centraliza horizontalmente.
  const ajustar = React.useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (vw - 32) / BASE_WIDTH));
    const tx = Math.max(0, (vw - BASE_WIDTH * scale) / 2);
    setT({ scale, tx, ty: PAD_TOP });
  }, []);

  // Enquadra na montagem e quando a largura do viewport muda.
  React.useEffect(() => {
    ajustar();
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom centrado num ponto do viewport (mantem o ponto sob o cursor fixo).
  const zoomEm = React.useCallback((fator: number, cx: number, cy: number) => {
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * fator));
      const k = scale / prev.scale;
      // ponto no espaco do conteudo: (c - tx)/prev.scale; mantem fixo => ajusta t.
      const tx = cx - (cx - prev.tx) * k;
      const ty = cy - (cy - prev.ty) * k;
      return { scale, tx, ty };
    });
  }, []);

  const zoomBotao = React.useCallback(
    (fator: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      zoomEm(fator, vp.clientWidth / 2, vp.clientHeight / 2);
    },
    [zoomEm],
  );

  // Wheel: ctrl/cmd = zoom no cursor; senao = pan (vertical + horizontal).
  React.useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = vp.getBoundingClientRect();
        const fator = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomEm(fator, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setT((prev) => ({ ...prev, tx: prev.tx - e.deltaX, ty: prev.ty - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomEm]);

  // Pan arrastando: comeca so quando o pointer-down e no FUNDO do canvas (nao em
  // cima do papel do relatorio, para nao atrapalhar a busca/tabela).
  const panRef = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const alvo = e.target as HTMLElement;
    const noFundo = alvo.dataset.canvasBg === "1";
    if (!noFundo) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty };
    setArrastando(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setT((prev) => ({ ...prev, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    setArrastando(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ok
    }
  };

  const pct = Math.round(t.scale * 100);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={viewportRef}
        data-canvas-bg="1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          "h-full w-full overflow-hidden",
          "bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px]",
          arrastando ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* aviso para o ponteiro do pan: o fundo carrega o data-canvas-bg; o
            conteudo abaixo NAO, entao arrastar sobre o papel nao inicia pan. */}
        <div
          ref={contentRef}
          style={{
            width: BASE_WIDTH,
            transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {children}
        </div>
      </div>

      {/* Controles flutuantes (canto inferior direito). */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-20 flex items-center gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-md backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBotao(1 / 1.2)}
          aria-label="Diminuir zoom"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums text-foreground">
          {pct}%
        </span>
        <button
          type="button"
          onClick={() => zoomBotao(1.2)}
          aria-label="Aumentar zoom"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={ajustar}
          aria-label="Ajustar a tela"
          title="Ajustar a tela"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {/* Dica discreta (canto inferior esquerdo). */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden items-center gap-1.5 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur sm:flex">
        <Hand className="h-3.5 w-3.5" aria-hidden />
        Arraste o fundo para mover · ctrl/cmd + scroll para zoom
      </div>
    </div>
  );
}
