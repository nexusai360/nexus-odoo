"use client";

// Renders BI dos componentes de Vendas (C-*) para o construtor modular. Reusa os
// MESMOS componentes ricos de Estoque (donut com centro, barras interativas,
// ranking de cards, distribuição dinâmica, mapa do Brasil, tabela rica).

import { useState, type ReactNode } from "react";
import { CircleDollarSign, ShoppingBag, Receipt, Percent } from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { InteractiveBarChart } from "@/components/charts/interactive/bar-chart";
import { RankingCards } from "@/components/diretoria/charts/ranking-cards";
import { DistribuicaoDinamica } from "@/components/diretoria/charts/distribuicao-dinamica";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { getColorByIndex } from "@/components/charts/colors";
import { brl, brlCompacto, num, pct1, rotuloUf, ufValida } from "@/components/diretoria/kit/format";
import type { VendasData } from "@/components/diretoria/vendas/vendas-screen";

function topComOutros(linhas: { chave: string; valorTotal: number }[], max = 7) {
  if (linhas.length <= max) return linhas.map((l) => ({ name: l.chave, value: l.valorTotal }));
  const top = linhas.slice(0, max).map((l) => ({ name: l.chave, value: l.valorTotal }));
  const resto = linhas.slice(max).reduce((s, l) => s + l.valorTotal, 0);
  return [...top, { name: "Outros", value: resto }];
}

// C-01 , Indicadores de vendas (KPIs).
function KpisVendas({ d }: { d: VendasData }) {
  const i = d.indicadores;
  return (
    <div className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiButton rotulo="Faturamento" valor={brlCompacto(i.faturamento)} valorCompleto={brl.format(i.faturamento)} icone={CircleDollarSign} hint="Notas de saída" />
      <KpiButton rotulo="Pedidos" valor={num.format(i.numPedidos)} icone={ShoppingBag} tone="info" hint="No período" />
      <KpiButton rotulo="Ticket médio" valor={brlCompacto(i.ticketMedio)} valorCompleto={brl.format(i.ticketMedio)} icone={Receipt} tone="info" hint="Faturamento ÷ pedidos" />
      <KpiButton rotulo="Margem estimada" valor={pct1(d.margem.margemPct)} icone={Percent} tone="success" hint="Receita − custo estimado" />
    </div>
  );
}

// C-02 , Vendas por estado: MAPA do Brasil coroplético.
function MapaVendas({ d }: { d: VendasData }) {
  // Só UFs com geografia (exclui "Sem UF", que não tem posição no mapa).
  const data = d.porUf.linhas.filter((l) => ufValida(l.uf)).map((l) => ({ uf: l.uf, valor: l.valorTotal }));
  return <BrazilMap data={data} metric="Faturamento" formatValor={(v) => brl.format(v)} />;
}

// C-03 , Vendas por marca: BARRAS horizontais.
function BarrasMarca({ d }: { d: VendasData }) {
  const data = topComOutros(d.porMarca.linhas.map((l) => ({ chave: l.marca, valorTotal: l.valorTotal })), 8).map((s) => ({ name: s.name, valor: s.value }));
  return (
    <InteractiveBarChart
      data={data}
      series={[{ key: "valor", label: "Faturamento", color: getColorByIndex(2) }]}
      layout="horizontal"
      height={240}
      yAxisWidth={120}
      showLegend={false}
      formatValue={(v) => brlCompacto(v)}
      ariaLabel="Faturamento por marca (barras horizontais)"
    />
  );
}

// C-04 , Ranking de estados por faturamento: LISTA DE CARDS.
function RankingEstados({ d }: { d: VendasData }) {
  const itens = d.porUf.linhas.map((l) => ({ nome: rotuloUf(l.uf), valor: l.valorTotal, sub: `${num.format(l.quantidade)} ${l.quantidade === 1 ? "venda" : "vendas"}` }));
  return <RankingCards itens={itens} max={15} rotuloValor="faturamento" />;
}

// C-05 , Modalidades de operação: BARRAS horizontais. Os nomes de operação são
// MUITO longos (ex.: "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS") e
// se sobrepunham no eixo. Encurtamos o rótulo (1 linha) e damos altura/folga.
function encurtar(s: string, max = 26): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
function ModalidadesVendas({ d }: { d: VendasData }) {
  const data = d.modalidades.slice(0, 8).map((m) => ({ name: encurtar(m.modalidade), valor: m.valorTotal }));
  return (
    <InteractiveBarChart
      data={data}
      series={[{ key: "valor", label: "Valor", color: getColorByIndex(5) }]}
      layout="horizontal"
      height={340}
      yAxisWidth={200}
      showLegend={false}
      formatValue={(v) => brlCompacto(v)}
      ariaLabel="Valor por modalidade de operação"
    />
  );
}

// C-07 , Formas de pagamento: DONUT clássico com LEGENDA LATERAL (bolinha + valor
// + %) e clique numa fatia para destacar/filtrar.
function DonutPagamento({ d }: { d: VendasData }) {
  const [sel, setSel] = useState<string | null>(null);
  const data = d.formasPagamento.linhas.map((l) => ({ label: l.formaPagamento, valor: l.valorTotal }));
  return (
    <DonutChart
      data={data}
      formatValor={(v) => brl.format(v)}
      onSelect={(label) => setSel(label || null)}
      selecionado={sel}
      vertical
    />
  );
}

// C-09 , Distribuição dinâmica (marca / estado / pagamento).
function DistribuicaoVendas({ d }: { d: VendasData }) {
  return (
    <DistribuicaoDinamica
      dimensoes={[
        { chave: "marca", rotulo: "Marca", linhas: d.porMarca.linhas.map((l) => ({ chave: l.marca, valorTotal: l.valorTotal })) },
        { chave: "uf", rotulo: "Estado", linhas: d.porUf.linhas.map((l) => ({ chave: rotuloUf(l.uf), valorTotal: l.valorTotal })) },
        { chave: "pagamento", rotulo: "Pagamento", linhas: d.formasPagamento.linhas.map((l) => ({ chave: l.formaPagamento, valorTotal: l.valorTotal })) },
      ]}
    />
  );
}

/** Mapeia o componenteId do catálogo para o render BI de Vendas. */
export function renderBlocoVendas(id: string, d: VendasData): ReactNode {
  switch (id) {
    case "C-01": return <KpisVendas d={d} />;
    case "C-02": return <MapaVendas d={d} />;
    case "C-03": return <BarrasMarca d={d} />;
    case "C-04": return <RankingEstados d={d} />;
    case "C-05": return <ModalidadesVendas d={d} />;
    case "C-07": return <DonutPagamento d={d} />;
    case "C-09": return <DistribuicaoVendas d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
