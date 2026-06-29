"use client";

// Tela "Pedidos & Entregas" da Diretoria (módulo B do HTML) , reconstrução BI
// por abas: Visão geral / Mapa / Pendentes. Dado real do cache
// (queries/pedidos.ts). Reusa KIT, BrazilMap (tooltip que segue o cursor),
// DonutChart e DataTable. ui-ux-pro-max: Data-Dense Dashboard dark+violeta.

import { useMemo, useState } from "react";
import {
  Truck, PackageCheck, AlertTriangle, HandCoins, Map as MapIcon, TrendingUp,
  ListChecks, Layers,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { SectionCard } from "@/components/diretoria/kit/section-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import type { IndicadoresDemandas, DemandaUf, DemandaLinha } from "@/lib/diretoria/queries/pedidos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR");
const pct1 = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const DASH = "-";

export interface PedidosData {
  indicadores: IndicadoresDemandas;
  aReceber: number;
  porUf: { linhas: DemandaUf[]; valorGeral: number };
  pendentes: { linhas: DemandaLinha[] };
}

const ABAS = [
  { id: "visao", label: "Visão geral", icon: TrendingUp },
  { id: "mapa", label: "Mapa", icon: MapIcon },
  { id: "pendentes", label: "Pendentes", icon: ListChecks },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

export function PedidosScreen({ data }: { data: PedidosData }) {
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
      <TabsContent value="mapa"><AbaMapa data={data} /></TabsContent>
      <TabsContent value="pendentes"><AbaPendentes data={data} /></TabsContent>
    </Tabs>
  );
}

function KpisTopo({ data }: { data: PedidosData }) {
  const { indicadores, aReceber } = data;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiButton rotulo="Demandas a entregar" valor={num.format(indicadores.totalPendentes)} icone={Truck} tone="info" hint="Pedidos não finalizados" />
      <KpiButton rotulo="Valor a entregar" valor={brl.format(indicadores.valorAEntregar)} icone={PackageCheck} hint="Total dos produtos pendentes" />
      <KpiButton rotulo="Atrasadas" valor={num.format(indicadores.atrasadas)} icone={AlertTriangle} tone={indicadores.atrasadas > 0 ? "danger" : "success"} hint="Data prevista vencida" />
      <KpiButton rotulo="A receber de clientes" valor={brl.format(aReceber)} icone={HandCoins} tone="warning" hint="Contas a receber em aberto" />
    </div>
  );
}

// ===========================================================================
// VISÃO GERAL
// ===========================================================================
function AbaVisao({ data }: { data: PedidosData }) {
  const porEtapa = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of data.pendentes.linhas) {
      const k = l.etapa ?? "Sem etapa";
      m.set(k, (m.get(k) ?? 0) + l.valor);
    }
    return [...m.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor);
  }, [data.pendentes.linhas]);

  const topUf = data.porUf.linhas.filter((l) => l.uf !== "??").slice(0, 6);
  const totalUf = data.porUf.valorGeral || 1;

  return (
    <div className="flex flex-col gap-4">
      <KpisTopo data={data} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Demandas por etapa" subtitle="Valor pendente por etapa do pedido" icon={Layers}>
          {porEtapa.length ? (
            <DonutChart data={porEtapa} maxFatias={8} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem demandas pendentes.</p>
          )}
        </SectionCard>
        <SectionCard title="Top estados a entregar" subtitle={`${topUf.length} de ${data.porUf.linhas.length} estados`} icon={MapIcon}>
          {topUf.length ? (
            <div className="flex flex-col gap-2.5">
              {topUf.map((l) => {
                const frac = l.valorTotal / totalUf;
                return (
                  <div key={l.uf} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
                    <span className="text-sm font-medium">{l.uf}</span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${Math.max(2, frac * 100)}%` }} />
                    </div>
                    <span className="w-36 shrink-0 text-right text-sm tabular-nums">{brl.format(l.valorTotal)} · {pct1(frac * 100)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados por estado.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ===========================================================================
// MAPA (B4)
// ===========================================================================
function AbaMapa({ data }: { data: PedidosData }) {
  const { porUf } = data;
  const mapData = useMemo(
    () => porUf.linhas.filter((l) => l.uf !== "??").map((l) => ({ uf: l.uf, valor: l.valorTotal })),
    [porUf.linhas],
  );
  const linhas = porUf.linhas.map((l) => ({
    uf: l.uf === "??" ? "Não informado" : l.uf,
    demandas: l.quantidade,
    valorTotal: l.valorTotal,
    participacao: porUf.valorGeral > 0 ? (l.valorTotal / porUf.valorGeral) * 100 : 0,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "uf", header: "Estado", tipo: "texto" },
    { key: "demandas", header: "Demandas", tipo: "numero" },
    { key: "valorTotal", header: "Valor a entregar", tipo: "moeda" },
    { key: "participacao", header: "% do total", tipo: "percentual" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpisTopo data={data} />
      <SectionCard title="Mapa de demandas por estado" subtitle="Valor a entregar · passe o mouse no mapa" icon={MapIcon}>
        {mapData.length ? (
          <BrazilMap data={mapData} metric="Valor a entregar" maxSelection={1} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem demandas por estado.</p>
        )}
      </SectionCard>
      <SectionCard title="Ranking de estados" subtitle={`${num.format(linhas.length)} estados`} icon={TrendingUp}>
        <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="demandas-por-estado" estado={linhas.length === 0 ? "vazio" : "ok"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// PENDENTES (B2)
// ===========================================================================
type PendFiltro = "todas" | "atrasadas" | "no_prazo" | "sem";
function AbaPendentes({ data }: { data: PedidosData }) {
  const [filtro, setFiltro] = useState<PendFiltro>("todas");
  const [busca, setBusca] = useState("");

  const contagem = useMemo(() => {
    const c = { todas: data.pendentes.linhas.length, atrasadas: 0, no_prazo: 0, sem: 0 };
    for (const l of data.pendentes.linhas) {
      if (l.dataPrevista == null) c.sem += 1;
      else if (l.atrasado) c.atrasadas += 1;
      else c.no_prazo += 1;
    }
    return c;
  }, [data.pendentes.linhas]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.pendentes.linhas
      .filter((l) => {
        if (filtro === "atrasadas") return l.atrasado;
        if (filtro === "no_prazo") return !l.atrasado && l.dataPrevista != null;
        if (filtro === "sem") return l.dataPrevista == null;
        return true;
      })
      .filter((l) => (!q ? true : [l.numero, l.cliente, l.uf, l.etapa].some((v) => (v ?? "").toLowerCase().includes(q))));
  }, [data.pendentes.linhas, filtro, busca]);

  return (
    <div className="flex flex-col gap-4">
      <KpisTopo data={data} />
      <SectionCard
        title="Pedidos pendentes"
        subtitle={`${num.format(linhas.length)} de ${num.format(data.pendentes.linhas.length)} pedidos`}
        icon={ListChecks}
        action={<Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº, cliente, UF, etapa…" className="h-8 w-56 text-sm" />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([
            { id: "todas", label: "Todas", count: contagem.todas },
            { id: "atrasadas", label: "Atrasadas", count: contagem.atrasadas },
            { id: "no_prazo", label: "No prazo", count: contagem.no_prazo },
            { id: "sem", label: "Sem previsão", count: contagem.sem },
          ] as { id: PendFiltro; label: string; count: number }[]).map((o) => {
            const ativo = o.id === filtro;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setFiltro(o.id)}
                aria-pressed={ativo}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "border-violet-500/60 bg-violet-600/15 text-violet-200" : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                )}
              >
                {o.label}
                <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", ativo ? "bg-violet-500/30" : "bg-muted")}>{num.format(o.count)}</span>
              </button>
            );
          })}
        </div>
        {linhas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido para este filtro.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => (
                  <TableRow key={l.numero ?? i} className="hover:bg-muted/40">
                    <TableCell className="font-medium tabular-nums">{l.numero ?? DASH}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={l.cliente ?? undefined}>{l.cliente ?? DASH}</TableCell>
                    <TableCell>{l.uf === "??" ? DASH : l.uf}</TableCell>
                    <TableCell>{l.etapa ? <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">{l.etapa}</span> : DASH}</TableCell>
                    <TableCell>
                      {l.dataPrevista == null ? (
                        <span className="text-xs text-muted-foreground">Sem previsão</span>
                      ) : l.atrasado ? (
                        <span className="inline-flex rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 ring-1 ring-inset ring-rose-500/20">Atrasado</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20 tabular-nums">{l.dataPrevista}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{brl.format(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
