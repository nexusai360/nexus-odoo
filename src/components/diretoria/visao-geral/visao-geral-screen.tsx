"use client";

// Home executiva da Diretoria , composição client (KPIs, mapa premium, donuts,
// atalhos). Recebe só dados serializáveis do server (page). Os ícones vivem aqui
// (não podem cruzar a fronteira server→client). ui-ux-pro-max: Data-Dense dark.

import Link from "next/link";
import {
  TrendingUp, HandCoins, Wallet, Boxes, Truck, ArrowRight, Tag, Layers, Receipt,
  type LucideIcon,
} from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { SectionCard } from "@/components/diretoria/kit/section-card";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { DonutChart, type DonutDatum } from "@/components/diretoria/charts/donut-chart";
import { brl, brlCompacto, num } from "@/components/diretoria/kit/format";

const ATALHO_ICON: Record<string, LucideIcon> = {
  "/diretoria/vendas": TrendingUp,
  "/diretoria/pedidos": Truck,
  "/diretoria/estoque": Boxes,
};

export interface VisaoGeralData {
  faturamento: number;
  ticketMedio: number;
  numPedidos: number;
  aReceber: number;
  aPagar: number;
  valorEstoque: number;
  produtos: number;
  demandasTotal: number;
  demandasAtrasadas: number;
  mapData: { uf: string; valor: number }[];
  vendasMarca: DonutDatum[];
  estoqueFamilia: DonutDatum[];
  atalhos: { href: string; label: string; desc: string }[];
}

export function VisaoGeralScreen({ data }: { data: VisaoGeralData }) {
  return (
    <div className="flex flex-col gap-5">
      {/* KPIs globais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiButton rotulo="Faturamento" valor={brlCompacto(data.faturamento)} valorCompleto={brl.format(data.faturamento)} icone={TrendingUp} hint="Vendas no período" />
        <KpiButton rotulo="Ticket médio" valor={brlCompacto(data.ticketMedio)} valorCompleto={brl.format(data.ticketMedio)} icone={Receipt} tone="info" hint={`${num.format(data.numPedidos)} pedidos`} />
        <KpiButton rotulo="A receber" valor={brlCompacto(data.aReceber)} valorCompleto={brl.format(data.aReceber)} icone={HandCoins} tone="warning" hint="Clientes em aberto" />
        <KpiButton rotulo="A pagar" valor={brlCompacto(data.aPagar)} valorCompleto={brl.format(data.aPagar)} icone={Wallet} tone="warning" hint="Fornecedores em aberto" />
        <KpiButton rotulo="Valor em estoque" valor={brlCompacto(data.valorEstoque)} valorCompleto={brl.format(data.valorEstoque)} icone={Boxes} hint={`${num.format(data.produtos)} produtos`} />
        <KpiButton rotulo="Demandas a entregar" valor={num.format(data.demandasTotal)} icone={Truck} tone={data.demandasAtrasadas > 0 ? "danger" : "info"} hint={`${num.format(data.demandasAtrasadas)} atrasadas`} />
      </div>

      {/* Mapa em destaque */}
      <SectionCard title="Faturamento por estado" subtitle="Vendas no período · passe o mouse no mapa" icon={TrendingUp}>
        {data.mapData.length ? (
          <BrazilMap data={data.mapData} metric="Faturamento" maxSelection={1} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem vendas por estado no período.</p>
        )}
      </SectionCard>

      {/* Distribuições */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Vendas por marca" subtitle="Participação no faturamento" icon={Tag}>
          {data.vendasMarca.length ? (
            <DonutChart data={data.vendasMarca} maxFatias={8} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem vendas por marca no período.</p>
          )}
        </SectionCard>
        <SectionCard title="Estoque por família" subtitle="Distribuição do valor em estoque" icon={Layers}>
          {data.estoqueFamilia.length ? (
            <DonutChart data={data.estoqueFamilia} maxFatias={8} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados de estoque.</p>
          )}
        </SectionCard>
      </div>

      {/* Atalhos (drill-in) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.atalhos.map((a) => {
          const Icon = ATALHO_ICON[a.href] ?? TrendingUp;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/50 p-5 transition-colors hover:border-violet-500/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10">
                  <Icon className="h-5 w-5 text-violet-400" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
