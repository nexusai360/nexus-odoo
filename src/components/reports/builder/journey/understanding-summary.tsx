"use client";

// src/components/reports/builder/journey/understanding-summary.tsx
// Reflexo de entendimento da jornada: um bloco discreto que mostra, em LINGUAGEM
// NATURAL, o que a IA ja entendeu (ex.: "Ate aqui entendi: voce quer o estoque
// parado por marca, com o valor imobilizado"). NAO e um checklist de dimensoes:
// nada de rotulos tecnicos. Tokens do dashboard de consumo (Card discreto).
import { Sparkles } from "lucide-react";

export function UnderstandingSummary({ texto }: { texto?: string }) {
  const t = texto?.trim();
  if (!t) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-violet-500/80">
          O que ja entendi
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground">{t}</p>
      </div>
    </div>
  );
}
