"use client";

// Renders BI dos componentes de Pedidos & Entregas (B-*) para o construtor
// modular. Reusa os componentes ricos (KPIs, mapa do Brasil, ranking de cards,
// tabela rica com tags de prazo).

import type { ReactNode } from "react";
import { PackageCheck, Wallet, AlertTriangle, HandCoins } from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { RankingCards } from "@/components/diretoria/charts/ranking-cards";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { brl, brlCompacto, num, DASH, rotuloUf, ufValida, nomeLimpo } from "@/components/diretoria/kit/format";
import type { PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";

// B-01 , Indicadores de demandas (KPIs).
function KpisDemandas({ d }: { d: PedidosData }) {
  const i = d.indicadores;
  return (
    <div className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiButton rotulo="Pendentes" valor={num.format(i.totalPendentes)} icone={PackageCheck} tone="info" hint="A entregar" />
      <KpiButton rotulo="A entregar" valor={brlCompacto(i.valorAEntregar)} valorCompleto={brl.format(i.valorAEntregar)} icone={Wallet} hint="Valor em aberto" />
      <KpiButton rotulo="Atrasadas" valor={num.format(i.atrasadas)} icone={AlertTriangle} tone={i.atrasadas > 0 ? "danger" : "success"} hint="Prazo vencido" />
      <KpiButton rotulo="A receber" valor={brlCompacto(d.aReceber)} valorCompleto={brl.format(d.aReceber)} icone={HandCoins} tone="success" hint="Pedidos faturados" />
    </div>
  );
}

// B-02 / B-03 , Mapa de demandas por estado.
function MapaDemandas({ d }: { d: PedidosData }) {
  const data = d.porUf.linhas.filter((l) => ufValida(l.uf)).map((l) => ({ uf: l.uf, valor: l.valorTotal }));
  return <BrazilMap data={data} metric="Demandas a entregar" formatValor={(v) => brl.format(v)} />;
}

// B-05 , Ranking de estados por demanda: LISTA DE CARDS.
function RankingDemandasUf({ d }: { d: PedidosData }) {
  const itens = d.porUf.linhas.map((l) => ({ nome: rotuloUf(l.uf), valor: l.valorTotal, sub: `${num.format(l.quantidade)} ${l.quantidade === 1 ? "demanda" : "demandas"}` }));
  return <RankingCards itens={itens} max={15} rotuloValor="valor a entregar" />;
}

// B-04 , Pendentes: TABELA RICA com tag de prazo.
function Pendentes({ d }: { d: PedidosData }) {
  const linhas = d.pendentes.linhas.map((l) => ({
    numero: l.numero ?? DASH,
    cliente: nomeLimpo(l.cliente) || DASH,
    uf: rotuloUf(l.uf),
    etapa: l.etapa ?? DASH,
    situacao: l.atrasado ? "Atrasado" : "No prazo",
    previsao: l.dataPrevista ?? "Sem previsão",
    valor: l.valor,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Número", tipo: "texto" },
    { key: "cliente", header: "Cliente", tipo: "texto" },
    { key: "uf", header: "UF", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: {
      Atrasado: "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      "No prazo": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    } },
    { key: "previsao", header: "Previsão", tipo: "data" },
    { key: "valor", header: "Valor", tipo: "moeda" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="pedidos-pendentes" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

/** Mapeia o componenteId do catálogo para o render BI de Pedidos. */
export function renderBlocoPedidos(id: string, d: PedidosData): ReactNode {
  switch (id) {
    case "B-01": return <KpisDemandas d={d} />;
    case "B-02": return <MapaDemandas d={d} />;
    case "B-03": return <MapaDemandas d={d} />;
    case "B-04": return <Pendentes d={d} />;
    case "B-05": return <RankingDemandasUf d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
