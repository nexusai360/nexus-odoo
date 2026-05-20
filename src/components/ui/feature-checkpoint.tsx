"use client";

/**
 * FeatureCheckpoint — controle de 3 estados (Off / Playground / Produção).
 *
 * Substitui o toggle on/off dos recursos do Agente Nex (áudio, imagem, KB e
 * documentos da base de conhecimento). Implementado como segmented control
 * acessível: clicável, navegável por teclado (setas), com aria-pressed em cada
 * segmento. Cores: cinza (OFF), âmbar (PLAYGROUND — cor da tag "playground" do
 * consumo), roxo (PRODUCTION).
 */

import { cn } from "@/lib/utils";

export type CheckpointState = "OFF" | "PLAYGROUND" | "PRODUCTION";

const STEPS: { value: CheckpointState; label: string; dot: string; active: string }[] = [
  {
    value: "OFF",
    label: "Desativado",
    dot: "bg-muted-foreground/40",
    active: "bg-muted text-foreground",
  },
  {
    value: "PLAYGROUND",
    label: "Playground",
    dot: "bg-amber-500",
    active: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    value: "PRODUCTION",
    label: "Produção",
    dot: "bg-violet-500",
    active: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
];

interface FeatureCheckpointProps {
  value: CheckpointState;
  onChange: (next: CheckpointState) => void;
  disabled?: boolean;
  /** Rótulo acessível do grupo. */
  "aria-label"?: string;
  className?: string;
}

export function FeatureCheckpoint({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: FeatureCheckpointProps) {
  function handleKey(e: React.KeyboardEvent) {
    if (disabled) return;
    const idx = STEPS.findIndex((s) => s.value === value);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(STEPS[Math.min(idx + 1, STEPS.length - 1)].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(STEPS[Math.max(idx - 1, 0)].value);
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {STEPS.map((step) => {
        const selected = step.value === value;
        return (
          <button
            key={step.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => !disabled && onChange(step.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              selected
                ? step.active
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                selected ? step.dot : "bg-muted-foreground/30",
              )}
            />
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

/** Cor do ícone de um recurso conforme o checkpoint (cinza/âmbar/roxo). */
export function checkpointIconClass(state: CheckpointState): string {
  if (state === "PRODUCTION") return "text-violet-500";
  if (state === "PLAYGROUND") return "text-amber-500";
  return "text-muted-foreground/50";
}
