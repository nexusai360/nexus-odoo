"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { TourOverlay } from "./tour-overlay";

export interface TourStep {
  id: string;
  /** CSS selector do elemento a destacar. Use `[data-tour='...']`. */
  targetSelector: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
}

export interface TourConfig {
  id: string;
  title: string;
  steps: TourStep[];
}

interface TourContextValue {
  active: TourConfig | null;
  currentStepIndex: number;
  start: (config: TourConfig) => void;
  next: () => void;
  prev: () => void;
  finish: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Provider central do tour. Mantém o estado do tour ativo e do passo atual,
 * e renderiza o `TourOverlay` quando há tour rodando.
 *
 * Deve ser montado uma única vez no layout protegido para envolver todas as
 * páginas internas.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<TourConfig | null>(null);
  const [step, setStep] = useState(0);

  const start = useCallback((config: TourConfig) => {
    setActive(config);
    setStep(0);
  }, []);

  const next = useCallback(() => {
    setStep((s) => s + 1);
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const finish = useCallback(() => {
    setActive(null);
    setStep(0);
  }, []);

  return (
    <TourContext.Provider
      value={{ active, currentStepIndex: step, start, next, prev, finish }}
    >
      {children}
      {active ? <TourOverlay config={active} stepIndex={step} /> : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour deve ser usado dentro de TourProvider");
  }
  return ctx;
}
