"use client";

/**
 * RangeSlider , slider numérico com leitura tabular ao lado. Usado na "Janela
 * de contexto" (10 a 50). Acessível por teclado (input range nativo) e com
 * badge mostrando o valor atual. Acento violeta consistente com a tela.
 */

import { cn } from "@/lib/utils";

interface RangeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  /** Sufixo do badge (ex.: "mensagens"). */
  unitLabel?: string;
  "aria-label"?: string;
}

export function RangeSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  unitLabel,
  "aria-label": ariaLabel,
}: RangeSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-violet-600",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <span className="inline-flex min-w-[3.5rem] items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium tabular-nums text-foreground">
        {value}
        {unitLabel ? <span className="ml-1 text-muted-foreground">{unitLabel}</span> : null}
      </span>
    </div>
  );
}
