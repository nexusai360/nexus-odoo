"use client";

// src/components/reports/builder/journey/roteiro-indicador.tsx
// F6 , indicador discreto do roteiro de perguntas ("Pergunta X de N") no topo da
// coluna da entrevista. Segmentos preenchidos = perguntas ja cobertas. Quando o
// roteiro CRESCE (a IA percebe mais complexidade), o novo segmento entra com uma
// microanimacao , a pessoa sente "ficou mais complexo". Nao-interativo.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function RoteiroIndicador({
  total,
  respondidas,
}: {
  total: number;
  respondidas: number;
}) {
  const reduce = useReducedMotion();
  if (total <= 0) return null;

  const atual = Math.min(respondidas + 1, total);
  const completo = respondidas >= total;

  return (
    <div className="pointer-events-none flex justify-center">
      <div className="inline-flex items-center gap-2.5 rounded-full bg-violet-500/10 px-3 py-1 ring-1 ring-violet-400/25 backdrop-blur-md">
        <span className="text-[11px] font-semibold tabular-nums text-violet-700 dark:text-violet-200">
          {completo ? "Tudo certo para montar" : `Pergunta ${atual} de ${total}`}
        </span>
        <div className="flex items-center gap-1" aria-hidden>
          <AnimatePresence initial={false}>
            {Array.from({ length: total }).map((_, i) => {
              const preenchido = i < respondidas;
              return (
                <motion.span
                  key={i}
                  initial={reduce ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className={
                    "block h-1.5 w-1.5 rounded-full transition-colors duration-300 " +
                    (preenchido ? "bg-violet-500" : "bg-violet-500/25")
                  }
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
