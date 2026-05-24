"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";

export interface TourStep {
  /** Seletor CSS do elemento a destacar. Se null, exibe o balão centralizado. */
  target: string | null;
  /** Título do passo. */
  title: string;
  /** Descrição do passo. */
  description: string;
}

interface ReportTourProps {
  /** Conjunto de passos do tour. */
  steps: TourStep[];
  /** Tour ativo? */
  active: boolean;
  /** Chamado ao concluir ou pular o tour. */
  onClose: (completed: boolean) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8; // px de padding ao redor do elemento destacado

/** Calcula a posição do balão relativa ao highlight, evitando sair da viewport. */
function calcBalloonPosition(
  rect: Rect,
  balloonWidth: number,
  balloonHeight: number,
): { top: number; left: number; placement: "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.top - rect.height - PADDING;
  const spaceAbove = rect.top - PADDING;

  let placement: "top" | "bottom" = "bottom";
  if (spaceBelow < balloonHeight + 16 && spaceAbove > spaceBelow) {
    placement = "top";
  }

  let top =
    placement === "bottom"
      ? rect.top + rect.height + PADDING + 8
      : rect.top - balloonHeight - PADDING - 8;

  let left = rect.left + rect.width / 2 - balloonWidth / 2;
  left = Math.max(12, Math.min(left, vw - balloonWidth - 12));
  top = Math.max(12, Math.min(top, vh - balloonHeight - 12));

  return { top, left, placement };
}

/**
 * Componente genérico de tour de onboarding.
 *
 * Recebe passos via prop (reutilizável pela F6). Cada passo destaca um
 * elemento da tela via spotlight (overlay com buraco) e exibe um balão
 * explicativo com barra de progresso, botões Pular / Anterior / Próximo.
 *
 * O posicionamento é recalculado em cada mudança de passo e em resize.
 */
export function ReportTour({ steps, active, onClose }: ReportTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  // Altura do balão é mantida em state para não acessar ref durante render
  const [balloonHeight, setBalloonHeight] = useState(180);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  // Garante que o portal só renderiza no cliente
  useEffect(() => { setMounted(true); }, []);

  // Callback de medição , depende de `step` (objeto inteiro) para não
  // violar react-hooks/preserve-manual-memoization
  const measureTarget = useCallback(() => {
    const target = step?.target ?? null;
    if (!target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(target);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top + window.scrollY,
      left: r.left + window.scrollX,
      width: r.width,
      height: r.height,
    });
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);

  useEffect(() => {
    if (!active) return;
    setCurrentStep(0);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    measureTarget();
    window.addEventListener("resize", measureTarget);
    return () => window.removeEventListener("resize", measureTarget);
  }, [active, measureTarget]);

  // Callback ref: atualiza a altura do balão quando o elemento é montado/atualizado
  const balloonCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setBalloonHeight(node.offsetHeight || 180);
    }
  }, []);

  const handleNext = () => {
    if (isLast) {
      onClose(true);
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const handleSkip = () => {
    onClose(false);
  };

  if (!active || !mounted || !step) return null;

  // Posição do spotlight
  const highlightTop = targetRect ? targetRect.top - PADDING : 0;
  const highlightLeft = targetRect ? targetRect.left - PADDING : 0;
  const highlightWidth = targetRect ? targetRect.width + PADDING * 2 : 0;
  const highlightHeight = targetRect ? targetRect.height + PADDING * 2 : 0;

  // Posição do balão (fixo na viewport para scroll-safe)
  const balloonWidth = 320;

  let balloonStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: balloonWidth,
    zIndex: 10001,
  };

  if (targetRect) {
    // Converte de posição-scroll para posição-viewport
    const fixedRect: Rect = {
      top: targetRect.top - window.scrollY,
      left: targetRect.left - window.scrollX,
      width: targetRect.width,
      height: targetRect.height,
    };
    const { top, left } = calcBalloonPosition(fixedRect, balloonWidth, balloonHeight);
    balloonStyle = {
      position: "fixed",
      top,
      left,
      width: balloonWidth,
      zIndex: 10001,
    };
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tour: passo ${currentStep + 1} de ${steps.length}`}
    >
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 z-[10000] bg-black/60"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />

      {/* Spotlight , buraco recortado via clip-path não funciona com border-radius,
          usamos 4 retângulos ao redor do alvo para simular a abertura. */}
      {targetRect && (
        <>
          {/* Topo */}
          <div
            aria-hidden="true"
            className="fixed z-[10000] bg-transparent"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(0, highlightTop - window.scrollY),
              background: "transparent",
            }}
          />
          {/* Esquerda */}
          <div
            aria-hidden="true"
            className="fixed z-[10000]"
            style={{
              top: Math.max(0, highlightTop - window.scrollY),
              left: 0,
              width: Math.max(0, highlightLeft - window.scrollX),
              height: highlightHeight,
              background: "transparent",
            }}
          />
          {/* Direita */}
          <div
            aria-hidden="true"
            className="fixed z-[10000]"
            style={{
              top: Math.max(0, highlightTop - window.scrollY),
              left: Math.max(0, highlightLeft - window.scrollX) + highlightWidth,
              right: 0,
              height: highlightHeight,
              background: "transparent",
            }}
          />
          {/* Baixo */}
          <div
            aria-hidden="true"
            className="fixed z-[10000]"
            style={{
              top: Math.max(0, highlightTop - window.scrollY) + highlightHeight,
              left: 0,
              right: 0,
              bottom: 0,
              background: "transparent",
            }}
          />
          {/* Borda do elemento destacado */}
          <div
            aria-hidden="true"
            className="fixed z-[10000] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
            style={{
              top: Math.max(0, highlightTop - window.scrollY),
              left: Math.max(0, highlightLeft - window.scrollX),
              width: highlightWidth,
              height: highlightHeight,
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Balão */}
      <div
        ref={balloonCallbackRef}
        style={balloonStyle}
        className="rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10"
      >
        {/* Barra de progresso */}
        <div
          className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted"
          aria-label={`Progresso: ${currentStep + 1} de ${steps.length}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Cabeçalho */}
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {currentStep + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Pular tour"
            className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <h3 className="mb-1 font-heading text-sm font-semibold leading-snug">
          {step.title}
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          {step.description}
        </p>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="h-7 cursor-pointer px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Pular
          </Button>

          <div className="flex gap-1.5">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="h-7 cursor-pointer gap-1 px-2 text-xs"
                aria-label="Passo anterior"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                Anterior
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleNext}
              className={cn(
                "h-7 cursor-pointer gap-1 px-2 text-xs",
                isLast && "bg-primary/90 hover:bg-primary",
              )}
              aria-label={isLast ? "Concluir tour" : "Próximo passo"}
            >
              {isLast ? "Concluir" : "Próximo"}
              {!isLast && <ChevronRight className="size-3.5" aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
