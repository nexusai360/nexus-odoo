"use client";

// Gráfico DINÂMICO de distribuição do estoque. O usuário troca a DIMENSÃO
// (família/marca/local) e o TIPO de visualização (rosca/barras) e o gráfico
// muda na hora , o "gráfico dinâmico" que o cliente pediu (padrão Agente Nex).
// Reusa os componentes interativos ricos da plataforma (DonutWithCenter,
// InteractiveBarChart). ui-ux-pro-max: dark+violeta, toggles acessíveis, 150ms.

import { useMemo, useState } from "react";
import { PieChart, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { DonutWithCenter } from "@/components/charts/interactive/donut-with-center";
import { InteractiveBarChart } from "@/components/charts/interactive/bar-chart";
import { getColorByIndex } from "@/components/charts/colors";
import { brl, brlCompacto } from "@/components/diretoria/kit/format";

interface LinhaAgrupada { chave: string; valorTotal: number }
type Dimensao = "familia" | "marca" | "local";
type Tipo = "rosca" | "barras";

const ROTULO_DIM: Record<Dimensao, string> = { familia: "Família", marca: "Marca", local: "Local" };

function topComOutros(linhas: LinhaAgrupada[], max: number) {
  if (linhas.length <= max) return linhas.map((l) => ({ name: l.chave, value: l.valorTotal }));
  const top = linhas.slice(0, max).map((l) => ({ name: l.chave, value: l.valorTotal }));
  const resto = linhas.slice(max).reduce((s, l) => s + l.valorTotal, 0);
  return [...top, { name: "Outros", value: resto }];
}

function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ativo
          ? "border-violet-500/60 bg-violet-600/15 text-violet-200"
          : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function DistribuicaoDinamica({
  familia,
  marca,
  local,
}: {
  familia: LinhaAgrupada[];
  marca: LinhaAgrupada[];
  local: LinhaAgrupada[];
}) {
  const [dim, setDim] = useState<Dimensao>("familia");
  const [tipo, setTipo] = useState<Tipo>("rosca");

  const fonte = dim === "familia" ? familia : dim === "marca" ? marca : local;
  const total = useMemo(() => fonte.reduce((s, l) => s + l.valorTotal, 0), [fonte]);
  const dadosDonut = useMemo(() => topComOutros(fonte, 7).map((s, i) => ({ ...s, color: getColorByIndex(i) })), [fonte]);
  const dadosBarras = useMemo(() => topComOutros(fonte, 8).map((s) => ({ name: s.name, valor: s.value })), [fonte]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["familia", "marca", "local"] as const).map((dd) => (
            <Pilula key={dd} ativo={dim === dd} onClick={() => setDim(dd)}>{ROTULO_DIM[dd]}</Pilula>
          ))}
        </div>
        {/* Toggle de tipo de visualização */}
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setTipo("rosca")}
            aria-pressed={tipo === "rosca"}
            aria-label="Ver como rosca"
            className={cn("rounded-md p-1.5 transition-colors cursor-pointer", tipo === "rosca" ? "bg-violet-600/20 text-violet-200" : "text-muted-foreground hover:text-foreground")}
          >
            <PieChart className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTipo("barras")}
            aria-pressed={tipo === "barras"}
            aria-label="Ver como barras"
            className={cn("rounded-md p-1.5 transition-colors cursor-pointer", tipo === "barras" ? "bg-violet-600/20 text-violet-200" : "text-muted-foreground hover:text-foreground")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tipo === "rosca" ? (
          <DonutWithCenter
            data={dadosDonut}
            centerLabel={`Total ${ROTULO_DIM[dim].toLowerCase()}`}
            centerValue={brlCompacto(total)}
            formatValue={(v) => brl.format(v)}
            height={250}
            innerRadius={64}
            outerRadius={96}
            tooltipPosition="top-left"
            ariaLabel={`Distribuição do estoque por ${ROTULO_DIM[dim].toLowerCase()}`}
          />
        ) : (
          <InteractiveBarChart
            data={dadosBarras}
            series={[{ key: "valor", label: "Valor em estoque", color: getColorByIndex(0) }]}
            layout="horizontal"
            height={250}
            yAxisWidth={120}
            showLegend={false}
            formatValue={(v) => brlCompacto(v)}
            ariaLabel={`Valor de estoque por ${ROTULO_DIM[dim].toLowerCase()} (barras)`}
          />
        )}
      </div>
    </div>
  );
}
