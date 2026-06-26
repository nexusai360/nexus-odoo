"use client";

// src/components/reports/builder/canvas-viewport.tsx
// F6 , Canvas do preview do construtor (estilo Figma/mapa mental):
// - abre SEMPRE ajustado a largura (mede o conteudo real; re-ajusta enquanto o
//   usuario nao interage, cobrindo o caso de a largura so existir depois do mount);
// - arrastar em QUALQUER lugar move o canvas (exceto sobre controles interativos;
//   um threshold preserva o clique); scroll comum = pan; ctrl/cmd+scroll = zoom SUAVE;
// - no 1o load mostra uma mao animada (fundo embacado): 2x "arraste" + 2x "pinca de
//   zoom"; some ao terminar OU assim que o usuario faz um gesto real (arraste/zoom).
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Minus, Plus, Maximize, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

/** Largura logica minima do "papel" do relatorio. */
const BASE_WIDTH = 1040;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const PAD_TOP = 24;
const MARGIN = 24;
const DRAG_THRESHOLD = 4;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/** Alvo interativo (nao deve iniciar arraste): deixa o clique/seleção passar. */
function ehInterativo(el: HTMLElement | null): boolean {
  return !!el?.closest(
    'input,textarea,select,button,a,[role="button"],[contenteditable="true"]',
  );
}

type FaseDica = "drag" | "zoom" | null;

export function CanvasViewport({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [t, setT] = React.useState<Transform>({ scale: 1, tx: MARGIN, ty: PAD_TOP });
  const tRef = React.useRef(t);
  React.useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [arrastando, setArrastando] = React.useState(false);
  // Auto-enquadra ate o 1o gesto do usuario; depois respeita o que ele fez.
  const autoFitRef = React.useRef(true);

  // Mede a largura natural do conteudo (ignora o transform) e enquadra.
  const ajustar = React.useCallback(() => {
    const vp = viewportRef.current;
    const c = contentRef.current;
    if (!vp || !c) return;
    const vw = vp.clientWidth;
    if (vw <= 0) return;
    const cw = Math.max(c.offsetWidth, c.scrollWidth, BASE_WIDTH);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (vw - MARGIN * 2) / cw));
    const tx = Math.max(MARGIN, (vw - cw * scale) / 2);
    setT({ scale, tx, ty: PAD_TOP });
  }, []);

  const reenquadrar = React.useCallback(() => {
    autoFitRef.current = true;
    ajustar();
  }, [ajustar]);

  // Enquadra ja no 1o frame + de novo no proximo (caso a largura assente depois).
  useIsoLayoutEffect(() => {
    ajustar();
    const raf = requestAnimationFrame(ajustar);
    const vp = viewportRef.current;
    const c = contentRef.current;
    if (typeof ResizeObserver === "undefined" || !vp) return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(() => {
      if (autoFitRef.current) ajustar();
    });
    ro.observe(vp);
    if (c) ro.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Dica animada (mao) em 2 fases: arraste (2x) e pinca de zoom (2x). ----
  const [fase, setFase] = React.useState<FaseDica>("drag");
  React.useEffect(() => {
    if (fase === "drag") {
      const id = window.setTimeout(() => setFase("zoom"), 2600);
      return () => window.clearTimeout(id);
    }
    if (fase === "zoom") {
      const id = window.setTimeout(() => setFase(null), 2600);
      return () => window.clearTimeout(id);
    }
  }, [fase]);
  const encerrarDica = React.useCallback(() => setFase(null), []);

  // Zoom centrado num ponto do viewport (mantem o ponto sob o cursor fixo).
  const zoomEm = React.useCallback((fator: number, cx: number, cy: number) => {
    autoFitRef.current = false;
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * fator));
      const k = scale / prev.scale;
      return { scale, tx: cx - (cx - prev.tx) * k, ty: cy - (cy - prev.ty) * k };
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
      encerrarDica();
      if (e.ctrlKey || e.metaKey) {
        const rect = vp.getBoundingClientRect();
        const bruto = Math.exp(-e.deltaY * 0.0016);
        const fator = Math.min(1.12, Math.max(0.89, bruto));
        zoomEm(fator, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        autoFitRef.current = false;
        setT((prev) => ({ ...prev, tx: prev.tx - e.deltaX, ty: prev.ty - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomEm, encerrarDica]);

  // Arraste em qualquer lugar (menos sobre controles). Threshold preserva o
  // clique; so um gesto REAL (apos mover) encerra a dica.
  const dragRef = React.useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (ehInterativo(e.target as HTMLElement)) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty, moved: false };
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
      autoFitRef.current = false;
      setArrastando(true);
      encerrarDica();
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
          ref={contentRef}
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

      <DicaCanvas fase={fase} reduce={!!reduce} />

      {/* Controles flutuantes (canto inferior direito). */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-30 flex items-center gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-md backdrop-blur">
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
          onClick={reenquadrar}
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

/**
 * Pinca de zoom: polegar + indicador saindo de um mesmo ponto (o "pulso") e
 * ABRINDO/FECHANDO o angulo entre eles, como o gesto de pinca do trackpad.
 */
function PincaZoom({ reduce }: { reduce: boolean }) {
  const t = reduce
    ? {}
    : { duration: 1.2, repeat: 1, repeatType: "reverse" as const, ease: "easeInOut" };
  return (
    <div className="relative h-10 w-12">
      {/* indicador (dedo de cima/esquerda) */}
      <motion.div
        className="absolute bottom-1 left-1/2 h-7 w-2 -translate-x-1/2 rounded-full bg-violet-500"
        style={{ transformOrigin: "50% 100%" }}
        animate={reduce ? {} : { rotate: [-8, -30] }}
        transition={t}
      />
      {/* polegar (dedo de baixo/direita) */}
      <motion.div
        className="absolute bottom-1 left-1/2 h-6 w-2 -translate-x-1/2 rounded-full bg-violet-400"
        style={{ transformOrigin: "50% 100%" }}
        animate={reduce ? {} : { rotate: [8, 30] }}
        transition={t}
      />
      {/* pulso (ponto de origem dos dedos) */}
      <span className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-violet-600" />
    </div>
  );
}

/**
 * Camada de dica: fundo embacado + cartao central com a mao. Fase "drag" mostra a
 * mao deslizando; fase "zoom" mostra a pinca (polegar + indicador abrindo/fechando).
 * pointer-events-none: gestos passam direto para o canvas (interrompem a dica).
 */
function DicaCanvas({ fase, reduce }: { fase: FaseDica; reduce: boolean }) {
  return (
    <AnimatePresence>
      {fase ? (
        <motion.div
          key="dica"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          {/* Embacado do fundo para destacar a mao. */}
          <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />

          <div className="relative flex w-60 flex-col items-center gap-3 rounded-2xl border border-border bg-card/90 px-6 py-5 shadow-xl backdrop-blur">
            <div className="relative flex h-12 w-full items-center justify-center">
              {fase === "drag" ? (
                <motion.div
                  animate={reduce ? {} : { x: [-26, 26, -26] }}
                  transition={reduce ? {} : { duration: 1.2, repeat: 1, ease: "easeInOut" }}
                  className="text-violet-500"
                >
                  <Hand className="h-8 w-8" aria-hidden />
                </motion.div>
              ) : (
                <PincaZoom reduce={reduce} />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {fase === "drag" ? "Arraste para mover" : "Pince para dar zoom"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {fase === "drag"
                  ? "Clique e arraste em qualquer lugar"
                  : "Trackpad: pinça · Mouse: ctrl/cmd + scroll"}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
