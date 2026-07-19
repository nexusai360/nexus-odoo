"use client";

// Renders BI dos componentes de Pedidos & Entregas (B-*) para o construtor
// modular. Reusa os componentes ricos (KPIs, mapa do Brasil, ranking de cards,
// tabela rica com tags de prazo).

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  PackageCheck, Wallet, AlertTriangle, HandCoins,
  ClipboardList, Receipt, Coins, Info, History,
} from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { RankingCards } from "@/components/diretoria/charts/ranking-cards";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { cn } from "@/lib/utils";
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

// B-06 , Demanda por etapa: rosca do valor em aberto por etapa do pedido.
function DemandaPorEtapa({ d }: { d: PedidosData }) {
  const data = d.porEtapa.map((e) => ({ label: e.etapaNome ?? "Sem etapa", valor: e.valorTotal }));
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem demanda em aberto.</p>;
  }
  return <DonutChart data={data} maxFatias={8} />;
}

// B-07 , Demandas mais paradas: tabela com dias parado e selo de criticidade.
// A cor é reforçada pelo texto do selo (não depende só de cor , WCAG).
function selo(dias: number | null): "Crítico" | "Atenção" | "Recente" {
  if (dias != null && dias >= 30) return "Crítico";
  if (dias != null && dias >= 14) return "Atenção";
  return "Recente";
}
function MaisParadas({ d }: { d: PedidosData }) {
  const linhas = d.maisParadas.map((l) => ({
    numero: l.numero ?? DASH,
    cliente: nomeLimpo(l.cliente) || DASH,
    uf: rotuloUf(l.uf),
    etapa: l.etapa ?? DASH,
    diasParado: l.diasParado ?? 0,
    situacao: selo(l.diasParado),
    valor: l.valor,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Número", tipo: "texto" },
    { key: "cliente", header: "Cliente", tipo: "texto" },
    { key: "uf", header: "UF", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "diasParado", header: "Dias parado", tipo: "numero" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: {
      "Crítico": "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      "Atenção": "bg-amber-500/10 text-amber-500 ring-1 ring-inset ring-amber-500/20",
      "Recente": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    } },
    { key: "valor", header: "Valor", tipo: "moeda" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="demandas-mais-paradas" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

// B-08 , Entregas parciais: os 3 valores + o corte, no topo do relatório.
// Alterna a inclusão dos pedidos anteriores à data de análise via URL (server refetch).
function ToggleCorteEntregas() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const incluiAntigos = sp.get("entregas_todos") === "1";
  const alternar = () => {
    const p = new URLSearchParams(sp.toString());
    if (incluiAntigos) p.delete("entregas_todos");
    else p.set("entregas_todos", "1");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={incluiAntigos}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        incluiAntigos
          ? "border-violet-500/60 bg-violet-600/15 text-violet-700 dark:text-violet-200"
          : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      <History className="h-3.5 w-3.5" aria-hidden />
      {incluiAntigos ? "Incluindo pedidos anteriores à data de análise" : "Incluir pedidos anteriores à data de análise"}
    </button>
  );
}

function KpisEntregasParciais({ d }: { d: PedidosData }) {
  const i = d.entregasParciais.indicadores;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pedidos com saldo a entregar. Os três valores respondem a estranheza dos totais.
        </p>
        <ToggleCorteEntregas />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiButton rotulo="Pedidos" valor={num.format(i.qtdPedidos)} icone={ClipboardList} tone="info" hint="Em aberto no período" />
        <KpiButton rotulo="Total dos pedidos" valor={brlCompacto(i.totalPedido)} valorCompleto={brl.format(i.totalPedido)} icone={Receipt} hint="Valor cheio, a venda (inclui o já entregue)" />
        <KpiButton rotulo="Falta entregar (venda)" valor={brlCompacto(i.aAtenderVenda)} valorCompleto={brl.format(i.aAtenderVenda)} icone={Wallet} hint="Saldo a atender, a preço de venda" />
        <KpiButton rotulo="Falta entregar (custo)" valor={brlCompacto(i.aAtenderCusto)} valorCompleto={brl.format(i.aAtenderCusto)} icone={Coins} tone="success" hint="Saldo a atender, a custo (bate com o card)" />
      </div>
      {!d.entregasParciais.atendimentoSincronizado ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          A sincronização de atendimento está pendente: os valores usam a quantidade cheia do pedido.
        </p>
      ) : null}
    </div>
  );
}

// B-09 , Entregas parciais: a tabela operacional detalhada por item.
function TabelaEntregasParciais({ d }: { d: PedidosData }) {
  const linhas = d.entregasParciais.linhas.map((l) => ({
    numero: l.numero ?? DASH,
    mercos: l.numeroMercos ?? DASH,
    cliente: nomeLimpo(l.cliente) || DASH,
    uf: l.uf === "??" ? DASH : rotuloUf(l.uf),
    cidade: l.cidade ?? DASH,
    produto: l.produto ?? DASH,
    familia: l.familia ?? DASH,
    marca: l.marca ?? DASH,
    operacao: l.operacao ?? DASH,
    modalidade: l.modalidade ?? DASH,
    etapa: l.etapa ?? DASH,
    qtd: l.qtdAAtender,
    vlrVenda: l.valorVendaAAtender,
    vlrCusto: l.valorCustoAAtender,
    status: l.statusFinanceiro === "bloqueado" ? "Bloqueado" : "Liberado",
    forma: l.formaPagamento ?? "Não informado",
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Pedido", tipo: "texto" },
    { key: "mercos", header: "Nº Mercos", tipo: "texto" },
    { key: "cliente", header: "Cliente", tipo: "texto" },
    { key: "uf", header: "UF", tipo: "texto" },
    { key: "cidade", header: "Cidade", tipo: "texto" },
    { key: "produto", header: "Produto", tipo: "texto" },
    { key: "familia", header: "Família", tipo: "texto" },
    { key: "marca", header: "Marca", tipo: "texto" },
    { key: "operacao", header: "Operação", tipo: "texto" },
    { key: "modalidade", header: "Modalidade", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "qtd", header: "Qtd a atender", tipo: "numero" },
    { key: "vlrVenda", header: "A atender (venda)", tipo: "moeda" },
    { key: "vlrCusto", header: "A atender (custo)", tipo: "moeda" },
    { key: "status", header: "Financeiro", tipo: "tag", tagCores: {
      Liberado: "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
      Bloqueado: "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
    } },
    { key: "forma", header: "Forma de pagamento", tipo: "texto" },
  ];
  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      searchable
      compactoInicial
      alturaFluida
      exportFilename="entregas-parciais"
      estado={linhas.length === 0 ? "vazio" : "ok"}
    />
  );
}

/** Mapeia o componenteId do catálogo para o render BI de Pedidos. */
export function renderBlocoPedidos(id: string, d: PedidosData): ReactNode {
  switch (id) {
    case "B-01": return <KpisDemandas d={d} />;
    case "B-02": return <MapaDemandas d={d} />;
    case "B-03": return <MapaDemandas d={d} />;
    case "B-04": return <Pendentes d={d} />;
    case "B-05": return <RankingDemandasUf d={d} />;
    case "B-06": return <DemandaPorEtapa d={d} />;
    case "B-07": return <MaisParadas d={d} />;
    case "B-08": return <KpisEntregasParciais d={d} />;
    case "B-09": return <TabelaEntregasParciais d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
