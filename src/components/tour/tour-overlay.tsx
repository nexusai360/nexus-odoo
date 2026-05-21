"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour, type TourConfig, type TourStep } from "./tour-provider";

interface TourOverlayProps {
  config: TourConfig;
  stepIndex: number;
}

const POPOVER_WIDTH = 440; // px (default desktop) — caber footer com dots + "N de M" + Pular/Voltar/Próximo sem quebrar linha
const POPOVER_FALLBACK_HEIGHT = 220; // usado apenas no primeiro frame, antes de medir
const POPOVER_MARGIN = 12; // gap entre target e popover
const VIEWPORT_PADDING = 16; // distância mínima das bordas
const SPOTLIGHT_PADDING = 6; // padding do hole sobre o target
const NARROW_VIEWPORT_BREAKPOINT = 480; // px — abaixo disso, popover ocupa quase a viewport inteira

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function rectFromDOMRect(domRect: DOMRect): Rect {
  return {
    top: domRect.top,
    left: domRect.left,
    width: domRect.width,
    height: domRect.height,
  };
}

/**
 * Calcula posição do popover relativa ao viewport, com fallback automático
 * quando a placement preferida não cabe.
 *
 * Recebe `popoverWidth` e `popoverHeight` REAIS (medidos via ref) — só usa o
 * fallback fixo no primeiro frame antes da medição.
 */
function computePopoverPosition(
  rect: Rect | null,
  preferred: TourStep["placement"] = "bottom",
  viewport: { width: number; height: number },
  popoverWidth: number,
  popoverHeight: number,
): CSSProperties {
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: popoverWidth,
    };
  }

  const fits = (placement: NonNullable<TourStep["placement"]>): boolean => {
    switch (placement) {
      case "top":
        return rect.top - popoverHeight - POPOVER_MARGIN >= VIEWPORT_PADDING;
      case "bottom":
        return (
          rect.top + rect.height + POPOVER_MARGIN + popoverHeight <=
          viewport.height - VIEWPORT_PADDING
        );
      case "left":
        return rect.left - popoverWidth - POPOVER_MARGIN >= VIEWPORT_PADDING;
      case "right":
        return (
          rect.left + rect.width + POPOVER_MARGIN + popoverWidth <=
          viewport.width - VIEWPORT_PADDING
        );
    }
  };

  const order: Array<NonNullable<TourStep["placement"]>> = [
    preferred,
    "bottom",
    "top",
    "right",
    "left",
  ];
  const chosen =
    order.find((p) => fits(p)) ?? preferred ?? ("bottom" as const);

  let top = 0;
  let left = 0;
  switch (chosen) {
    case "top":
      top = rect.top - popoverHeight - POPOVER_MARGIN;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      break;
    case "bottom":
      top = rect.top + rect.height + POPOVER_MARGIN;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - popoverWidth - POPOVER_MARGIN;
      break;
    case "right":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left + rect.width + POPOVER_MARGIN;
      break;
  }

  // Clamp para garantir que o popover nunca saia da viewport.
  left = Math.max(
    VIEWPORT_PADDING,
    Math.min(left, viewport.width - popoverWidth - VIEWPORT_PADDING),
  );
  top = Math.max(
    VIEWPORT_PADDING,
    Math.min(top, viewport.height - popoverHeight - VIEWPORT_PADDING),
  );

  return { top, left, width: popoverWidth };
}

export function TourOverlay({ config, stepIndex }: TourOverlayProps) {
  const { next, prev, finish } = useTour();
  const reduceMotion = useReducedMotion();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const step = config.steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === config.steps.length - 1;

  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>(
    () =>
      typeof window !== "undefined"
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: 1024, height: 768 },
  );
  const [popoverHeight, setPopoverHeight] = useState<number>(POPOVER_FALLBACK_HEIGHT);
  const [mounted, setMounted] = useState(false);

  const popoverWidth =
    viewport.width < NARROW_VIEWPORT_BREAKPOINT
      ? Math.max(240, viewport.width - VIEWPORT_PADDING * 2)
      : POPOVER_WIDTH;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tracking do elemento target — scroll, resize e mutações do layout.
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (!el || !(el instanceof HTMLElement)) {
      setRect(null);
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const update = () => {
      setRect(rectFromDOMRect(el.getBoundingClientRect()));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step]);

  // Esc fecha o tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish();
      } else if (e.key === "ArrowRight" && !isLast) {
        next();
      } else if (e.key === "ArrowLeft" && !isFirst) {
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, next, prev, isFirst, isLast]);

  // Move o foco para o popover ao trocar de step (a11y) + mede altura real.
  useLayoutEffect(() => {
    popoverRef.current?.focus();
    if (popoverRef.current) {
      const h = popoverRef.current.offsetHeight;
      if (h > 0 && h !== popoverHeight) setPopoverHeight(h);
    }
  }, [stepIndex, popoverHeight]);

  // Observa mudanças de altura do popover (textos longos, conteúdo dinâmico).
  useEffect(() => {
    const el = popoverRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h > 0) setPopoverHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const popoverPos = useMemo(
    () =>
      computePopoverPosition(
        rect,
        step?.placement ?? "bottom",
        viewport,
        popoverWidth,
        popoverHeight,
      ),
    [rect, step?.placement, viewport, popoverWidth, popoverHeight],
  );

  if (!step || !mounted) return null;

  const enterDuration = reduceMotion ? 0 : 0.2;
  const popoverEnter = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.96, opacity: 0 };
  const popoverActive = reduceMotion
    ? { opacity: 1 }
    : { scale: 1, opacity: 1 };

  // Hole arredondado sobre o target — usa SVG mask para criar o spotlight
  // exato sem precisar combinar múltiplos divs com clip-path.
  const holePadding = SPOTLIGHT_PADDING;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour-overlay"
        className="fixed inset-0 z-[2000]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: enterDuration }}
      >
        {/* Backdrop com hole via SVG mask */}
        <svg
          className="pointer-events-auto fixed inset-0 h-full w-full"
          aria-hidden="true"
          onClick={finish}
        >
          <defs>
            <mask id={`tour-mask-${config.id}`}>
              <rect width="100%" height="100%" fill="white" />
              {rect ? (
                <rect
                  x={rect.left - holePadding}
                  y={rect.top - holePadding}
                  width={rect.width + holePadding * 2}
                  height={rect.height + holePadding * 2}
                  rx={10}
                  ry={10}
                  fill="black"
                />
              ) : null}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(8, 8, 12, 0.72)"
            mask={`url(#tour-mask-${config.id})`}
          />
        </svg>

        {/* Halo violeta destacando o target */}
        {rect ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed rounded-[10px] ring-2 ring-violet-400/90 ring-offset-2 ring-offset-transparent shadow-[0_0_0_4px_rgba(139,92,246,0.25)]"
            style={{
              top: rect.top - holePadding,
              left: rect.left - holePadding,
              width: rect.width + holePadding * 2,
              height: rect.height + holePadding * 2,
            }}
          />
        ) : null}

        {/* Popover */}
        <motion.div
          ref={popoverRef}
          tabIndex={-1}
          role="document"
          className="fixed z-[2010] outline-none"
          style={popoverPos}
          initial={popoverEnter}
          animate={popoverActive}
          exit={popoverEnter}
          transition={{ duration: enterDuration, ease: "easeOut" }}
        >
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-400">
                  {config.title}
                </p>
                <h3
                  id={titleId}
                  className="text-base font-semibold tracking-tight text-foreground"
                >
                  {step.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={finish}
                aria-label="Fechar tour"
                className="inline-flex h-11 w-11 -m-2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p
              id={descId}
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              {step.description}
            </p>

            {/* Footer: dots + step counter (em uma linha), botões (em outra) —
                duas linhas dedicadas evitam que "1 de 11" quebre o layout em
                viewports estreitos. */}
            <div className="mt-5 flex flex-col gap-3 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {config.steps.map((_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={
                        i === stepIndex
                          ? "h-1.5 w-5 rounded-full bg-violet-500"
                          : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
                      }
                    />
                  ))}
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {stepIndex + 1} de {config.steps.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={finish}
                  className="inline-flex h-9 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                >
                  Pular
                </button>
                {!isFirst ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={prev}
                    aria-label="Passo anterior"
                    className="h-9 whitespace-nowrap"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Voltar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={isLast ? finish : next}
                  aria-label={isLast ? "Concluir tour" : "Próximo passo"}
                  className="h-9 whitespace-nowrap bg-violet-600 text-white hover:bg-violet-500 focus-visible:ring-violet-500/60"
                >
                  {isLast ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Concluir
                    </>
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
