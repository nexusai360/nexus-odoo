"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  /** Rótulos das etapas, na ordem. */
  steps: string[];
  /** Etapa atual, base 1. */
  current: number;
  className?: string;
}

/**
 * Indicador de etapas para wizards: círculos numerados, conector entre eles,
 * etapa atual destacada, etapas concluídas com check. Compartilhado entre o
 * wizard de Webhook e o wizard de Chave de Acesso.
 */
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold leading-none tabular-nums",
                done && "bg-primary text-primary-foreground",
                active && "bg-primary/15 text-primary ring-1 ring-primary",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : <span className="translate-y-px">{n}</span>}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="ml-1 h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
