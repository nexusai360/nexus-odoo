"use client";

// Série temporal de compras (NF de entrada) , COMANDADA pela pílula de período
// global do construtor (igual "Custo por dia" do Consumo): a pílula define a
// granularidade e a janela; a seta ‹ › navega nessa granularidade. Reusa o
// InteractiveAreaChart (recharts) da plataforma. Só renderiza no client (o grid
// é mount-gated), então usar Date aqui não causa hydration mismatch.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InteractiveAreaChart } from "@/components/charts/interactive/area-chart";
import { CHART_COLORS } from "@/components/charts/colors";
import type { ComprasSerie, PontoSerie } from "@/lib/diretoria/queries/estoque";
import type { PeriodKey } from "@/lib/datetime-core";
import { brl, brlCompacto } from "@/components/diretoria/kit/format";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// --- helpers de data (UTC, coerentes com as chaves YYYY-MM-DD da série) ---
function isoHoje(): string { return new Date().toISOString().slice(0, 10); }
function shiftDia(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function shiftMes(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
}
function ultimoDiaDoMes(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10);
}
function fmtDia(iso: string): string { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
function fmtMesAno(iso: string): string { const [y, m] = iso.split("-"); return `${MESES_PT[Number(m) - 1]}/${y.slice(2)}`; }

interface Janela {
  gran: "dia" | "mes";
  deISO: string | null; // null = série inteira (Tudo)
  ateISO: string | null;
  rotulo: string;
  navegavel: boolean;
}

/** Resolve a janela de datas a partir da pílula de período + deslocamento. */
function calcularJanela(periodo: PeriodKey, customRange: { start: string; end: string } | undefined, offset: number): Janela {
  const hoje = isoHoje();
  switch (periodo) {
    case "todos":
      return { gran: "mes", deISO: null, ateISO: null, rotulo: "Todo o histórico", navegavel: false };
    case "hoje": {
      const dia = shiftDia(hoje, -offset);
      return { gran: "dia", deISO: dia, ateISO: dia, rotulo: fmtDia(dia), navegavel: true };
    }
    case "semana_atual": {
      const fim = shiftDia(hoje, -offset * 7);
      const ini = shiftDia(fim, -6);
      return { gran: "dia", deISO: ini, ateISO: fim, rotulo: `${fmtDia(ini)} a ${fmtDia(fim)}`, navegavel: true };
    }
    case "mes_atual": {
      const ref = shiftMes(hoje, -offset);
      const ini = `${ref.slice(0, 7)}-01`;
      const fim = offset === 0 ? hoje : ultimoDiaDoMes(ref);
      return { gran: "dia", deISO: ini, ateISO: fim, rotulo: fmtMesAno(ref), navegavel: true };
    }
    case "custom":
      if (customRange) {
        return { gran: "dia", deISO: customRange.start, ateISO: customRange.end, rotulo: `${fmtDia(customRange.start)} a ${fmtDia(customRange.end)}`, navegavel: false };
      }
      return { gran: "dia", deISO: null, ateISO: null, rotulo: "Personalizado", navegavel: false };
    default:
      return { gran: "mes", deISO: null, ateISO: null, rotulo: "Todo o histórico", navegavel: false };
  }
}

export function SerieTemporalCompras({
  serie,
  periodo = "semana_atual",
  customRange,
}: {
  serie: ComprasSerie;
  periodo?: PeriodKey;
  customRange?: { start: string; end: string };
}) {
  // offset = quantos períodos recuamos a partir do atual (0 = período corrente).
  const [offset, setOffset] = useState(0);
  // Trocar a pílula de período volta para o período corrente.
  useEffect(() => { setOffset(0); }, [periodo, customRange]);
  const janela = useMemo(() => calcularJanela(periodo, customRange, offset), [periodo, customRange, offset]);

  const { pontos, total } = useMemo(() => {
    const fonte: PontoSerie[] = janela.gran === "mes" ? serie.mensal : serie.diaria;
    const filtrados = janela.deISO && janela.ateISO
      ? fonte.filter((p) => p.data >= janela.deISO! && p.data <= janela.ateISO!)
      : fonte;
    return { pontos: filtrados, total: filtrados.reduce((s, p) => s + p.valor, 0) };
  }, [serie, janela]);

  const dataChart = pontos.map((p) => ({
    name: janela.gran === "mes" ? fmtMesAno(p.data) : fmtDia(p.data),
    valor: p.valor,
  }));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Total no período:{" "}
          <span className="font-semibold text-foreground" title={brl.format(total)}>
            {brlCompacto(total)}
          </span>
        </div>
        {/* Navegação dentro da granularidade da pílula (oculta em Tudo/Personalizado) */}
        {janela.navegavel ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label="Período anterior"
              className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7rem] text-center text-xs font-medium tabular-nums text-foreground/90">
              {janela.rotulo}
            </span>
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={offset === 0}
              aria-label="Próximo período"
              className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs font-medium text-foreground/80">{janela.rotulo}</span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <InteractiveAreaChart
          data={dataChart}
          series={[{ key: "valor", label: "Compras (NF entrada)", color: CHART_COLORS.violet }]}
          height={240}
          showGrid
          showLegend={false}
          formatValue={(v) => brlCompacto(v)}
          emptyMessage="Sem compras no período"
          emptyHint="Troque a pílula de período ou navegue com as setas."
          ariaLabel="Compras (NF de entrada) ao longo do período"
        />
      </div>
    </div>
  );
}
