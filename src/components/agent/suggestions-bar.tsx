"use client";

/**
 * SuggestionsBar — chips clicáveis com sugestões do agente.
 *
 * Portado de nexus-insights/src/components/nex/suggestions-bar.tsx.
 * Adaptações: renomeação nex→agent. Design inalterado.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §5
 */

import { cn } from "@/lib/utils";

export interface SuggestionsBarProps {
  suggestions: string[];
  onPick: (s: string) => void;
}

export function SuggestionsBar({ suggestions, onPick }: SuggestionsBarProps) {
  if (suggestions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Sugestões clicáveis"
      className="flex flex-wrap gap-2 px-1 pt-1"
    >
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={cn(
            "cursor-pointer rounded-full border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-700 transition-colors duration-200",
            "hover:border-violet-500/60 hover:bg-violet-500/15",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
            "dark:text-violet-300",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
