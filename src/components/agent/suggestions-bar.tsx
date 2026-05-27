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
// Fallback hardcoded para sugestoes pos-resposta. Distinto das welcome para
// evitar repeticao das chips de entrada (feedback usuario 2026-05-24).
const HARD_FALLBACK = [
  "Detalhe o faturamento dos últimos 7 dias.",
  "Qual cliente mais comprou neste mês?",
  "Compare o estoque atual com o do mês passado.",
  "Quais notas fiscais foram emitidas hoje?",
  "Quais títulos vencem nos próximos 5 dias?",
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
      // Stack vertical alinhada a esquerda (pedido usuario 2026-05-25 02:00):
      // chips em coluna, um por linha, todos colados na borda esquerda.
      className="flex flex-col items-start gap-2 px-1 pt-1"
    >
      {final.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={cn(
            // rounded-2xl em vez de rounded-full: pills mais altas com texto
            // multi-linha mantem cantos suaves sem virar capsula deformada.
            // text-left + whitespace-normal + max-w-full: quando texto quebra,
            // segunda linha alinha pela esquerda colada na primeira (fix do
            // bug de alinhamento centrado quando havia quebra de linha em
            // "Liste as 10 maiores clientes por faturamento no mes corrente").
            "max-w-full cursor-pointer rounded-2xl border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-left text-xs leading-snug text-violet-700 whitespace-normal break-words transition-colors duration-200",
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
