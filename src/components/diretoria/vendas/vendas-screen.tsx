"use client";

// Tela "Vendas" da Diretoria (módulo C do HTML) , reconstrução BI por abas.
// Visão geral / Por estado (mapa do Brasil) / Por marca / Pagamentos. Dado real
// do cache (queries/vendas.ts). ui-ux-pro-max: Data-Dense Dashboard dark+violeta,
// mapa coroplético com tooltip que segue o cursor, donuts clicáveis, KPIs.

import type {
  VisaoPagamento,
  ResumoVisaoPagamento,
} from "@/lib/diretoria/queries/vendas";
import { useMemo, useState } from "react";
import {
  TrendingUp, Map as MapIcon, Tag, CreditCard, DollarSign, ShoppingBag,
  Receipt, Percent, Trophy, Layers,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { SectionCard } from "@/components/diretoria/kit/section-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import type {
  IndicadoresVendas, MargemEstimada, LinhaUf, LinhaMarca,
  LinhaFormaPagamento, LinhaModalidade, MaiorPedido,
} from "@/lib/diretoria/queries/vendas";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("pt-BR");
const pct1 = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
function brlCompacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  return brl.format(v);
}
const DASH = "-";

export interface VendasData {
  indicadores: IndicadoresVendas;
  margem: MargemEstimada;
  porUf: { linhas: LinhaUf[]; valorGeral: number };
  porMarca: { linhas: LinhaMarca[]; valorGeral: number };
  formasPagamento: Record<VisaoPagamento, ResumoVisaoPagamento>;
  modalidades: LinhaModalidade[];
  maiorPedido: MaiorPedido | null;
}

const ABAS = [
  { id: "visao", label: "Visão geral", icon: TrendingUp },
  { id: "estados", label: "Por estado", icon: MapIcon },
  { id: "marcas", label: "Por marca", icon: Tag },
  { id: "pagamentos", label: "Pagamentos", icon: CreditCard },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

export function VendasScreen({ data }: { data: VendasData }) {
  const [aba, setAba] = useState<AbaId>("visao");
  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)} className="gap-5">
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
        {ABAS.map((a) => (
          <TabsTrigger key={a.id} value={a.id} className="flex-none gap-1.5 px-3 py-1.5">
            <a.icon className="h-3.5 w-3.5" aria-hidden />
            {a.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="visao"><AbaVisao data={data} /></TabsContent>
      <TabsContent value="estados"><AbaEstados data={data} /></TabsContent>
      <TabsContent value="marcas"><AbaMarcas data={data} /></TabsContent>
      <TabsContent value="pagamentos"><AbaPagamentos data={data} /></TabsContent>
    </Tabs>
  );
}

// ===========================================================================
// VISÃO GERAL (C2 + margem + maior pedido + modalidades)
// ===========================================================================
function AbaVisao({ data }: { data: VendasData }) {
  const { indicadores, margem, maiorPedido, modalidades } = data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Faturamento" valor={brl.format(indicadores.faturamento)} icone={DollarSign} hint="Notas de saída autorizadas" />
        <KpiButton rotulo="Pedidos" valor={num.format(indicadores.numPedidos)} icone={ShoppingBag} tone="info" hint="No período" />
        <KpiButton rotulo="Ticket médio" valor={brl.format(indicadores.ticketMedio)} icone={Receipt} tone="info" hint="Faturamento ÷ pedidos" />
        <KpiButton rotulo="Margem estimada" valor={indicadores.faturamento > 0 ? pct1(margem.margemPct) : DASH} icone={Percent} tone={margem.margemPct >= 25 ? "success" : "warning"} hint="Estimada (custo de catálogo)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Maior pedido do período" subtitle="Maior valor entre os pedidos (todas as operações)" icon={Trophy}>
          {maiorPedido ? (
            <div className="flex flex-col gap-2">
              <div className="text-3xl font-bold tabular-nums">{brl.format(maiorPedido.valor)}</div>
              <div className="text-sm text-muted-foreground">
                {maiorPedido.numero ? <span className="font-medium text-foreground">{maiorPedido.numero}</span> : null}
                {maiorPedido.participante ? ` · ${maiorPedido.participante}` : ""}
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem pedidos no período.</p>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/40 pt-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Receita</div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{brlCompacto(margem.receita)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo estimado</div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{brlCompacto(margem.custoEstimado)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lucro estimado</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-400">{brlCompacto(margem.margem)}</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Operações dos pedidos" subtitle="Por tipo de operação (vendas, compras e transferências)" icon={Layers}>
          {modalidades.length ? (
            <DonutChart data={modalidades.map((m) => ({ label: m.modalidade, valor: m.valorTotal }))} maxFatias={7} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados de modalidade.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ===========================================================================
// POR ESTADO (C3 , mapa do Brasil)
// ===========================================================================
function AbaEstados({ data }: { data: VendasData }) {
  const { porUf } = data;
  const [ufSel, setUfSel] = useState<string[]>([]);

  const mapData = useMemo(
    () =>
      porUf.linhas
        .filter((l) => l.uf !== "??")
        .map((l) => ({ uf: l.uf, valor: l.valorTotal })),
    [porUf.linhas],
  );

  const linhasTabela = useMemo(() => {
    const base = porUf.linhas.map((l) => ({
      uf: l.uf === "??" ? "Não informado" : l.uf,
      notas: l.quantidade,
      valorTotal: l.valorTotal,
      participacao: porUf.valorGeral > 0 ? (l.valorTotal / porUf.valorGeral) * 100 : 0,
    }));
    if (!ufSel.length) return base;
    const sel = new Set(ufSel);
    return base.filter((r) => sel.has(r.uf));
  }, [porUf.linhas, porUf.valorGeral, ufSel]);

  const colunas: ColumnDef<(typeof linhasTabela)[number]>[] = [
    { key: "uf", header: "Estado", tipo: "texto" },
    { key: "notas", header: "Notas", tipo: "numero" },
    { key: "valorTotal", header: "Faturamento", tipo: "moeda" },
    { key: "participacao", header: "% do total", tipo: "percentual" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Faturamento por estado"
        subtitle="Notas de saída autorizadas · passe o mouse no mapa, clique numa UF para focar"
        icon={MapIcon}
      >
        {mapData.length ? (
          <BrazilMap data={mapData} metric="Faturamento" maxSelection={1} onSelect={setUfSel} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem vendas por estado no período.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Ranking de estados"
        subtitle={`${num.format(linhasTabela.length)} estados${ufSel.length ? " (focado)" : ""}`}
        icon={TrendingUp}
      >
        <DataTable columns={colunas} rows={linhasTabela} searchable compactoInicial exportFilename="vendas-por-estado" estado={linhasTabela.length === 0 ? "vazio" : "ok"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// POR MARCA (C4)
// ===========================================================================
function AbaMarcas({ data }: { data: VendasData }) {
  const { porMarca } = data;
  const linhas = porMarca.linhas.map((m) => ({
    marca: m.marca,
    notas: m.quantidade,
    valorTotal: m.valorTotal,
    participacao: porMarca.valorGeral > 0 ? (m.valorTotal / porMarca.valorGeral) * 100 : 0,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "marca", header: "Marca", tipo: "texto" },
    { key: "notas", header: "Itens", tipo: "numero" },
    { key: "valorTotal", header: "Faturamento", tipo: "moeda" },
    { key: "participacao", header: "% do total", tipo: "percentual" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionCard title="Vendas por marca" subtitle="Participação no faturamento" icon={Tag}>
        {porMarca.linhas.length ? (
          <DonutChart data={porMarca.linhas.map((m) => ({ label: m.marca, valor: m.valorTotal }))} maxFatias={8} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem vendas por marca.</p>
        )}
      </SectionCard>
      <SectionCard title="Ranking de marcas" subtitle={`${num.format(linhas.length)} marcas`} icon={TrendingUp}>
        <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="vendas-por-marca" estado={linhas.length === 0 ? "vazio" : "ok"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// PAGAMENTOS (C10)
// ===========================================================================
const CORES_PGTO = ["#34d399", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee"];
function AbaPagamentos({ data }: { data: VendasData }) {
  const formasPagamento = data.formasPagamento.pago;
  const total = formasPagamento.valorGeral || 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {formasPagamento.linhas.length === 0 ? (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Sem parcelas com forma de pagamento.</p>
        ) : (
          formasPagamento.linhas.map((f, i) => {
            const frac = f.valorTotal / total;
            return (
              <div key={f.formaPagamento} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES_PGTO[i % CORES_PGTO.length] }} />
                  <span className="truncate text-sm font-medium" title={f.formaPagamento}>{f.formaPagamento}</span>
                </div>
                <div className="mt-2 text-xl font-bold tabular-nums">{brl.format(f.valorTotal)}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>{num.format(f.quantidade)} parcelas</span>
                  <span>{pct1(frac * 100)}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, frac * 100)}%`, background: CORES_PGTO[i % CORES_PGTO.length] }} />
                </div>
              </div>
            );
          })
        )}
      </div>
      <SectionCard title="Distribuição por forma de pagamento" subtitle={`Total: ${brl.format(formasPagamento.valorGeral)}`} icon={CreditCard}>
        {formasPagamento.linhas.length ? (
          <DonutChart data={formasPagamento.linhas.map((f) => ({ label: f.formaPagamento, valor: f.valorTotal }))} maxFatias={8} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>
        )}
      </SectionCard>
    </div>
  );
}
