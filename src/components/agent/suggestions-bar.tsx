"use client";

/**
 * SuggestionsBar , chips clicáveis com sugestões do agente.
 *
 * Portado de nexus-insights/src/components/nex/suggestions-bar.tsx.
 * Adaptações: renomeação nex→agent. Design inalterado.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §5
 */

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { padSuggestions } from "@/lib/agent/suggestion-fallback";

export interface SuggestionsBarProps {
  suggestions: string[];
  onPick: (s: string) => void;
  /** Quantidade alvo de chips (1..5). Quando o array vier curto, complementa
   *  com HARD_FALLBACK ate atingir o valor. Default 3 (matchar maxSuggestions
   *  default do AgentSettings). */
  targetCount?: number;
}

export function SuggestionsBar({
  suggestions,
  onPick,
  targetCount = 3,
}: SuggestionsBarProps) {
  const reduce = useReducedMotion();
  // Dedup + corte + complemento com HARD_FALLBACK: lógica compartilhada com o
  // painel de monitoramento (suggestion-fallback.ts) pra ambos baterem.
  const final = padSuggestions(suggestions, targetCount);
  if (final.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Sugestões clicáveis"
      // Stack vertical alinhada a esquerda (pedido usuario 2026-05-25 02:00):
      // chips em coluna, um por linha, todos colados na borda esquerda.
      // Espaço da mensagem da IA até a 1ª sugestão = espaço entre sugestões
      // (gap-2 = 8px). Padronizado (mesma medida no monitor).
      className="flex flex-col items-start gap-2 px-1 pt-2"
    >
      {final.map((s, i) => (
        <motion.button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          // Entrada escalonada: um chip por vez (1, 2, 3) apos a resposta ja
          // estar escrita por inteiro. ~110ms entre cada, entrada de 180ms.
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.18, delay: i * 0.11, ease: [0.16, 1, 0.3, 1] }
          }
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
        </motion.button>
      ))}
    </div>
  );
}
