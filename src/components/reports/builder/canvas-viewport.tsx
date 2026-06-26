"use client";

// src/components/reports/builder/canvas-viewport.tsx
// F6 , Canvas do preview do construtor (estilo Figma/mapa mental):
// - fit-to-width por padrao (o relatorio inteiro cabe na largura);
// - arrastar em QUALQUER lugar move o canvas (exceto sobre controles
//   interativos: inputs, botoes, links); um threshold preserva o clique;
// - zoom SUAVE: botoes (+/-) ou ctrl/cmd + scroll (proporcional ao gesto);
// - scroll comum = mover (pan) vertical/horizontal;
// - "ajustar" reenquadra; mao animada (3x) no 1o load ensina o arraste.
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Minus, Plus, Maximize, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

/** Largura logica do "papel" do relatorio (antes do zoom). */
const BASE_WIDTH = 1040;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const PAD_TOP = 24;
const DRAG_THRESHOLD = 4;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

/** Layout-effect no cliente (evita o flash em escala 1 antes de enquadrar). */
const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/** Alvo interativo (nao deve iniciar arraste): deixa o clique/seleção passar. */
function ehInterativo(el: HTMLElement | null): boolean {
  return !!el?.closest(
    'input,textarea,select,button,a,[role="button"],[contenteditable="true"]',
  );
}

export function CanvasViewport({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [t, setT] = React.useState<Transform>({ scale: 1, tx: 0, ty: PAD_TOP });
  const tRef = React.useRef(t);
  React.useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [arrastando, setArrastando] = React.useState(false);
  const [mostrarDica, setMostrarDica] = React.useState(true);

  // Enquadra: escala para a largura caber e centraliza horizontalmente.
  const ajustar = React.useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (vw - 32) / BASE_WIDTH));
    const tx = Math.max(0, (vw - BASE_WIDTH * scale) / 2);
    setT({ scale, tx, ty: PAD_TOP });
  }, []);

  // Enquadra JA no primeiro frame (layout effect) para abrir exatamente
  // ajustado a largura, sem piscar em escala 1. ResizeObserver mantem o
  // enquadramento quando o painel muda de tamanho.
  useIsoLayoutEffect(() => {
    ajustar();
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esconde a dica da mao apos a animacao (ou na 1a interacao).
  React.useEffect(() => {
    if (!mostrarDica) return;
    const id = window.setTimeout(() => setMostrarDica(false), 4200);
    return () => window.clearTimeout(id);
  }, [mostrarDica]);

  // Zoom centrado num ponto do viewport (mantem o ponto sob o cursor fixo).
  const zoomEm = React.useCallback((fator: number, cx: number, cy: number) => {
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * fator));
      const k = scale / prev.scale;
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

  // Wheel: ctrl/cmd (ou pinch do trackpad) = zoom SUAVE; senao = pan.
  React.useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setMostrarDica(false);
      if (e.ctrlKey || e.metaKey) {
        const rect = vp.getBoundingClientRect();
        // Proporcional ao gesto, com teto por evento (nada de salto forte).
        const bruto = Math.exp(-e.deltaY * 0.0016);
        const fator = Math.min(1.12, Math.max(0.89, bruto));
        zoomEm(fator, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setT((prev) => ({ ...prev, tx: prev.tx - e.deltaX, ty: prev.ty - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomEm]);

  // Arraste em qualquer lugar (menos sobre controles interativos). Threshold
  // preserva o clique: so vira "pan" depois de mover alguns pixels.
  const dragRef = React.useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (ehInterativo(e.target as HTMLElement)) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty, moved: false };
    setMostrarDica(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setArrastando(true);
    }
    setT((prev) => ({ ...prev, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "h-full w-full touch-none overflow-hidden select-none",
          "bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px]",
          arrastando ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div
          style={{
            width: BASE_WIDTH,
            transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>

      {/* Mao animada no 1o load: ensina que da pra arrastar (repete ~3x e some). */}
      <AnimatePresence>
        {mostrarDica ? (
          <motion.div
            key="drag-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/85 px-5 py-4 shadow-lg backdrop-blur">
              <motion.div
                animate={reduce ? {} : { x: [-22, 22, -22] }}
                transition={reduce ? {} : { duration: 1.1, repeat: 2, ease: "easeInOut" }}
                className="text-violet-500"
              >
                <Hand className="h-7 w-7" aria-hidden />
              </motion.div>
              <p className="text-xs font-medium text-foreground">Arraste para mover</p>
              <p className="text-[11px] text-muted-foreground">ctrl/cmd + scroll para dar zoom</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
    </div>
  );
}
