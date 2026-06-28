import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  HandCoins,
  Wallet,
  Boxes,
  Truck,
  ArrowRight,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import {
  requireDiretoriaArea,
  userUfs,
  canDiretoria,
} from "@/lib/diretoria/access";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
} from "@/lib/diretoria/queries/vendas";
import { queryIndicadoresDemandas } from "@/lib/diretoria/queries/pedidos";
import { queryIndicadoresEstoque } from "@/lib/diretoria/queries/estoque";
import {
  queryContasAReceber,
  queryContasAPagar,
} from "@/lib/reports/queries/financeiro";
import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
import { VendasMapaComparativo } from "@/components/diretoria/vendas-mapa-comparativo";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ATALHOS = [
  { href: "/diretoria/vendas", label: "Vendas", desc: "Faturamento, estados, marcas e pagamentos", icon: TrendingUp, cap: "diretoria.vendas.view" },
  { href: "/diretoria/pedidos", label: "Pedidos & Entregas", desc: "Demandas, dívida e mapa de entregas", icon: Truck, cap: "diretoria.pedidos.view" },
  { href: "/diretoria/estoque", label: "Estoque & Compras", desc: "Estoque por local e compras por fornecedor", icon: Boxes, cap: "diretoria.estoque.view" },
];

export default async function DiretoriaVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("visao_geral");
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const periodo = resolverPeriodoDir(
    { periodo: param("periodo") ?? "ano_atual", de: param("de"), ate: param("ate") },
    new Date(),
  );
  const ufs = await userUfs(user);
  const hoje = new Date();
  const filtros = { periodoDe: isoDia(periodo.de), periodoAte: isoDia(periodo.ate), ufs };

  const [vendas, vendasUf, demandas, estoque, aReceber, aPagar] = await Promise.all([
    queryIndicadoresVendas(prisma, filtros),
    queryVendasPorUf(prisma, filtros),
    queryIndicadoresDemandas(prisma, hoje),
    queryIndicadoresEstoque(prisma),
    queryContasAReceber(prisma, {}, hoje),
    queryContasAPagar(prisma, {}, hoje),
  ]);

  const atalhos = [] as typeof ATALHOS;
  for (const a of ATALHOS) {
    if (await canDiretoria(user, a.cap)) atalhos.push(a);
  }

  const mapData = vendasUf.linhas
    .filter((l) => l.uf !== "??")
    .map((l) => ({ uf: l.uf, valor: l.valorTotal, quantidade: l.quantidade }));

  const kpis = [
    { label: "Faturamento", valor: brl.format(vendas.faturamento), icon: TrendingUp },
    { label: "A receber", valor: brl.format(aReceber.totalAReceber), icon: HandCoins },
    { label: "A pagar", valor: brl.format(aPagar.totalAPagar), icon: Wallet },
    { label: "Valor em estoque", valor: brl.format(estoque.valorTotal), icon: Boxes },
    { label: "Demandas a entregar", valor: num.format(demandas.totalPendentes), icon: Truck },
  ];

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Visão geral"
        subtitle="Painel executivo da diretoria: indicadores, mapa do Brasil e atalhos."
      />

      <div className="flex flex-col gap-6">
        <DiretoriaPeriodBar />

        {/* KPIs globais */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600/10">
                  <k.icon className="h-3.5 w-3.5 text-violet-500" />
                </span>
              </div>
              <div className="mt-3 font-[var(--font-space-grotesk)] text-xl font-semibold tabular-nums">
                {k.valor}
              </div>
            </div>
          ))}
        </div>

        {/* Mapa em destaque */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Faturamento por estado</h2>
          <VendasMapaComparativo data={mapData} />
        </section>

        {/* Atalhos (drill-in) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {atalhos.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-violet-500/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10">
                  <a.icon className="h-5 w-5 text-violet-500" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
