"use client";

/**
 * SuggestionsBar , chips clicáveis com sugestões do agente.
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
  /** Quantidade alvo de chips (1..5). Quando o array vier curto, complementa
   *  com HARD_FALLBACK ate atingir o valor. Default 3 (matchar maxSuggestions
   *  default do AgentSettings). */
  targetCount?: number;
}

// Ultima camada de defesa contra "bolha sem chips" (bug 2026-05-24).
// Mesmo que o backend, o welcomeSuggestionsForUi e o personalized falhem,
// o usuario sempre ve 3 perguntas de gestor abaixo da resposta.
const HARD_FALLBACK = [
  "Quanto faturamos no mês corrente?",
  "Quanto temos em contas a receber em aberto?",
  "Qual o valor total do estoque em armazém?",
  "Quais pedidos de venda estão atrasados?",
  "Qual o valor total do estoque em armazém?",
];

export function SuggestionsBar({
  suggestions,
  onPick,
  targetCount = 3,
}: SuggestionsBarProps) {
  const cap = Math.min(Math.max(1, targetCount), 5);
  const seen = new Set<string>();
  const final: string[] = [];
  for (const s of suggestions) {
    const t = (s ?? "").trim();
    if (t && !seen.has(t) && final.length < cap) {
      seen.add(t);
      final.push(t);
    }
  }
  for (const s of HARD_FALLBACK) {
    if (final.length >= cap) break;
    if (!seen.has(s)) {
      seen.add(s);
      final.push(s);
    }
  }
  if (final.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Sugestões clicáveis"
      className="flex flex-wrap gap-2 px-1 pt-1"
    >
      {final.map((s) => (
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
