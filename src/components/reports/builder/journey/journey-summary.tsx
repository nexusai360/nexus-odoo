"use client";

// src/components/reports/builder/journey/journey-summary.tsx
// Tela de RESUMO da jornada: mostra, de forma confiavel, tudo que a pessoa
// escolheu, com cada item CONTESTAVEL ("ajustar" devolve a pergunta ao chat) e o
// botao "Gerar relatorio" (so aparece aqui). Tokens do dashboard de consumo.
import { Sparkles, Pencil, Check } from "lucide-react";
import type { ResumoJornada, Dimensao } from "@/lib/reports/builder/journey/state";

const ROTULO_DIMENSAO: Record<Dimensao, string> = {
  objetivo: "Objetivo",
  dados: "Dados",
  indicadores: "Indicadores",
  visualizacao: "Visualizacao",
  filtros: "Filtros",
  layout: "Layout",
  periodo: "Periodo",
};

export function JourneySummary({
  resumo,
  onAjustar,
  onGerar,
  gerando = false,
}: {
  resumo: ResumoJornada;
  onAjustar: (dimensao: Dimensao) => void;
  onGerar: () => void;
  gerando?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
          <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Tudo pronto para montar</h2>
          <p className="text-xs text-muted-foreground">Confira o que combinamos. Da para ajustar qualquer ponto.</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {resumo.itens.map((item, i) => (
          <li
            key={`${item.dimensao}-${i}`}
            className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {ROTULO_DIMENSAO[item.dimensao]}
              </p>
              <p className="mt-0.5 text-sm text-foreground">{item.texto}</p>
            </div>
            <button
              type="button"
              onClick={() => onAjustar(item.dimensao)}
              aria-label={`Ajustar ${ROTULO_DIMENSAO[item.dimensao]}`}
              className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3" />
              Ajustar
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onGerar}
        disabled={gerando}
        className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Check className="h-4 w-4" aria-hidden />
        {gerando ? "Montando seu relatorio..." : "Gerar relatorio"}
      </button>
    </div>
  );
}
