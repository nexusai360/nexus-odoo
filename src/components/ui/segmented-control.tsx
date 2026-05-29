"use client";

/**
 * SegmentedControl , grupo de opções mutuamente exclusivas (2 a 4 segmentos).
 * Estado ativo por fundo + peso (não só cor), foco visível, acessível.
 * Mesma linguagem visual do grupo "Máximo por resposta" da tela de Configuração.
 */

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  disabled?: boolean;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex w-fit rounded-lg border border-border bg-background p-0.5"
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (!isActive) onChange(opt.value);
            }}
            className={cn(
              "flex h-8 cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
              isActive
                ? "bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/40 dark:text-violet-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
