"use client";

// src/components/reports/builder/journey/geracao-overlay.tsx
// F6 , tela de espera da GERACAO (bastidores). Barra de % REAL (vinda dos eventos
// progress do SSE) + frases que giram (crossfade ~2.5s), SEM tempo numerico.
// Respeita prefers-reduced-motion. Ao 100% a barra completa e o pai transiciona
// para o 2-pane. Honestidade: se algo ficou de fora (omitidos), mostra no fim.
import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";

/** Frases por fase (client-side; nao importa o modulo server da geracao). */
const FRASES_UI: Record<string, string[]> = {
  blueprint: [
    "Entendendo o que vale a pena destacar",
    "Escolhendo os gráficos certos para cada número",
    "Montando a estrutura do seu relatório",
  ],
  revisao: [
    "Conferindo se a história fica clara",
    "Checando se não falta nada importante",
    "Deixando os destaques mais inteligentes",
  ],
  build: ["Encaixando as seções na ordem certa", "Dando os retoques finais"],
  validacao: ["Conferindo os últimos detalhes"],
  default: ["Montando seu relatório do seu jeito"],
};

export function GeracaoOverlay({
  pct,
  fase,
  omitidos,
}: {
  pct: number;
  fase?: string;
  omitidos?: string[];
}) {
  const reduce = useReducedMotion();
  const frases = FRASES_UI[fase ?? "default"] ?? FRASES_UI.default;
  const [idx, setIdx] = React.useState(0);

  // Reinicia o ciclo quando a fase muda (frases novas).
  React.useEffect(() => {
    setIdx(0);
  }, [fase]);

  // Rotacao das frases (timer local). Reduced-motion: sem giro.
  React.useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % frases.length), 2500);
    return () => clearInterval(id);
  }, [reduce, frases.length]);

  const fraseAtual = frases[idx % frases.length];
  const pctClamp = Math.max(0, Math.min(100, Math.round(pct)));
  const concluido = pctClamp >= 100 && (omitidos?.length ?? 0) > 0;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/90 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm">
        {/* Frase girando (crossfade) */}
        <div className="mb-3 flex min-h-[1.5rem] items-center justify-center">
          {/* motion.p keyed: remonta (crossfade de entrada) ao trocar a frase. */}
          <motion.p
            key={fraseAtual}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-center text-sm font-medium text-foreground"
          >
            {fraseAtual}
          </motion.p>
        </div>

        {/* Barra de progresso REAL */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-violet-500/15" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
            initial={false}
            animate={{ width: `${pctClamp}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        {/* Honestidade: o que ficou de fora (so no fim, se houver) */}
        {concluido ? (
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            Nao incluí {omitidos!.join("; ")}, porque esse dado ainda nao tem fonte por aqui.
          </p>
        ) : null}
      </div>
    </div>
  );
}
