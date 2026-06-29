"use client";

// Série temporal de compras (NF de entrada) para o construtor da Diretoria.
// Reusa o LineChartCard (recharts) da plataforma. Navegação de janela (‹ ›) por
// dia ou mês, igual ao "Custo por dia" do Consumo do Agente Nex: rótulo do
// intervalo, tooltip no hover, total da janela. Dado pronto do server (PontoSerie).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { LineChartCard } from "@/components/charts/line-chart";
import type { ComprasSerie, PontoSerie } from "@/lib/diretoria/queries/estoque";
import { brl, brlCompacto } from "@/components/diretoria/kit/format";

type Granularidade = "dia" | "mes";

/** Quantos pontos por janela em cada granularidade. */
const TAM_JANELA: Record<Granularidade, number> = { dia: 14, mes: 12 };

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo curto do eixo X a partir da chave temporal ("YYYY-MM-DD" | "YYYY-MM"). */
function rotuloEixo(chave: string, g: Granularidade): string {
  if (g === "dia") {
    const [, m, d] = chave.split("-");
    return `${d}/${m}`;
  }
  const [y, m] = chave.split("-");
  return `${MESES_PT[Number(m) - 1]}/${y.slice(2)}`;
}

/** Rótulo longo do intervalo exibido (para o cabeçalho da navegação). */
function rotuloIntervalo(janela: PontoSerie[], g: Granularidade): string {
  if (!janela.length) return "Sem período";
  const ini = rotuloEixo(janela[0].data, g);
  const fim = rotuloEixo(janela[janela.length - 1].data, g);
  return ini === fim ? ini : `${ini} a ${fim}`;
}

export function SerieTemporalCompras({ serie }: { serie: ComprasSerie }) {
  const [g, setG] = useState<Granularidade>("dia");
  // offset = quantas janelas recuamos a partir da mais recente (0 = atual).
  const [offset, setOffset] = useState(0);

  const pontos = g === "dia" ? serie.diaria : serie.mensal;
  const tam = TAM_JANELA[g];

  const { janela, podeVoltar, podeAvancar, totalJanela } = useMemo(() => {
    if (!pontos.length) {
      return { janela: [] as PontoSerie[], podeVoltar: false, podeAvancar: false, totalJanela: 0 };
    }
    const fimIdx = pontos.length - offset * tam;
    const iniIdx = Math.max(0, fimIdx - tam);
    const janela = pontos.slice(iniIdx, fimIdx);
    const total = janela.reduce((s, p) => s + p.valor, 0);
    return {
      janela,
      podeVoltar: iniIdx > 0,
      podeAvancar: offset > 0,
      totalJanela: total,
    };
  }, [pontos, offset, tam]);

  // Troca de granularidade reinicia a janela na mais recente.
  function trocarGran(nova: Granularidade) {
    if (nova === g) return;
    setG(nova);
    setOffset(0);
  }

  const dataChart = janela.map((p) => ({ rotulo: rotuloEixo(p.data, g), valor: p.valor, notas: p.notas }));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Toggle dia/mês */}
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
          {(["dia", "mes"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => trocarGran(opt)}
              aria-pressed={g === opt}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
                g === opt ? "bg-violet-600/20 text-violet-200" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt === "dia" ? "Por dia" : "Por mês"}
            </button>
          ))}
        </div>
        {/* Navegação de período */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            disabled={!podeVoltar}
            aria-label="Período anterior"
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center text-xs font-medium tabular-nums text-foreground/90">
            {rotuloIntervalo(janela, g)}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={!podeAvancar}
            aria-label="Próximo período"
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Total da janela */}
      <div className="text-xs text-muted-foreground">
        Total no período:{" "}
        <span className="font-semibold text-foreground" title={brl.format(totalJanela)}>
          {brlCompacto(totalJanela)}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <LineChartCard
          data={dataChart}
          config={{ xKey: "rotulo", formato: "moeda", series: [{ key: "valor", label: "Compras (NF entrada)" }] }}
          estado={dataChart.length === 0 ? "vazio" : "ok"}
        />
      </div>
    </div>
  );
}
