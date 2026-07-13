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
import { SEM_UF } from "@/lib/diretoria/uf";
import type { VendasData } from "@/components/diretoria/vendas/vendas-screen";
import type { VisaoPagamento } from "@/lib/diretoria/queries/vendas";

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

// C-02 , Vendas por estado: MAPA do Brasil coroplético. UFs sem geografia ("??")
// viram o pseudo-estado SEM_UF (quadrado "Sem UF"), para o total do mapa bater
// com o faturamento real do período.
function MapaVendas({ d }: { d: VendasData }) {
  const data = d.porUf.linhas.map((l) => ({ uf: ufValida(l.uf) ? l.uf : SEM_UF, valor: l.valorTotal }));
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

// C-07 , Formas de pagamento, em três visões.
//
// O gráfico antigo somava tudo num número só, misturando o que já foi pago com o que
// ainda vai vencer e com o que nem virou nota ainda. São perguntas diferentes, e o
// seletor separa cada uma:
//
//   Pago            a nota saiu e o título foi quitado. A receita que entrou.
//   A receber       a nota saiu, a parcela ainda vai vencer (boleto, cartão parcelado).
//   Carteira        o pedido está fechado com o cliente, mas a nota ainda não saiu.
const VISOES = [
  {
    chave: "pago" as const,
    rotulo: "Pago",
    descricao: "Nota emitida e título já quitado. É a receita que entrou.",
  },
  {
    chave: "a_receber" as const,
    rotulo: "A receber",
    descricao:
      "Nota emitida, parcela ainda a vencer (boleto ou cartão parcelado). A venda aconteceu; o dinheiro vem depois.",
  },
  {
    chave: "carteira" as const,
    rotulo: "Carteira em aberto",
    descricao:
      "Pedido fechado com o cliente e cobrança programada, mas a nota ainda não saiu. Como a receita só é reconhecida na nota, ainda não é faturamento.",
  },
];

function DonutPagamento({ d }: { d: VendasData }) {
  const [visao, setVisao] = useState<VisaoPagamento>("pago");
  const [sel, setSel] = useState<string | null>(null);
  const atual = d.formasPagamento[visao];
  const meta = VISOES.find((v) => v.chave === visao)!;
  const data = atual.linhas.map((l) => ({
    label: l.formaPagamento,
    valor: l.valorTotal,
  }));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {VISOES.map((v) => {
          const ativo = v.chave === visao;
          const resumo = d.formasPagamento[v.chave];
          return (
            <button
              key={v.chave}
              type="button"
              onClick={() => {
                setVisao(v.chave);
                setSel(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                ativo
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70"
              }`}
            >
              {v.rotulo}
              <span className="ml-1.5 tabular-nums opacity-70">
                {brlCompacto(resumo.valorGeral)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">{meta.descricao}</p>

      {atual.provisorios > 0 ? (
        <p className="text-xs text-amber-400">
          {atual.provisorios}{" "}
          {atual.provisorios === 1
            ? "título ainda é provisório"
            : "títulos ainda são provisórios"}{" "}
          no Odoo (lançados, não efetivados).
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        <DonutChart
          data={data}
          formatValor={(v) => brl.format(v)}
          onSelect={(label) => setSel(label || null)}
          selecionado={sel}
          vertical
        />
      </div>
    </div>
  );
}

// C-09 , Distribuição dinâmica (marca / estado / pagamento).
function DistribuicaoVendas({ d }: { d: VendasData }) {
  return (
    <DistribuicaoDinamica
      dimensoes={[
        { chave: "marca", rotulo: "Marca", linhas: d.porMarca.linhas.map((l) => ({ chave: l.marca, valorTotal: l.valorTotal })) },
        { chave: "uf", rotulo: "Estado", linhas: d.porUf.linhas.map((l) => ({ chave: rotuloUf(l.uf), valorTotal: l.valorTotal })) },
        { chave: "pagamento", rotulo: "Pagamento", linhas: d.formasPagamento.pago.linhas.map((l) => ({ chave: l.formaPagamento, valorTotal: l.valorTotal })) },
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
