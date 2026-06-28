import { TrendingUp, ShoppingCart, Receipt } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
} from "@/lib/diretoria/queries/vendas";
import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("pt-BR");

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DiretoriaVendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("vendas");
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const periodo = resolverPeriodoDir(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    new Date(),
  );
  const ufs = await userUfs(user);
  const filtros = {
    periodoDe: isoDia(periodo.de),
    periodoAte: isoDia(periodo.ate),
    ufs,
  };

  const [indicadores, vendasUf] = await Promise.all([
    queryIndicadoresVendas(prisma, filtros),
    queryVendasPorUf(prisma, filtros),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");

  const mapData = vendasUf.linhas
    .filter((l) => l.uf !== "??")
    .map((l) => ({ uf: l.uf, valor: l.valorTotal }));

  const kpis = [
    { label: "Faturamento", valor: brl.format(indicadores.faturamento), icon: TrendingUp },
    { label: "Pedidos no período", valor: num.format(indicadores.numPedidos), icon: ShoppingCart },
    { label: "Ticket médio", valor: brl.format(indicadores.ticketMedio), icon: Receipt },
  ];

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Vendas"
        subtitle="Faturamento, vendas por estado e marca, modalidades e formas de pagamento."
        actions={podeSync ? <SyncNowButton area="vendas" /> : undefined}
      />

      <div className="flex flex-col gap-6">
        <DiretoriaPeriodBar />

        {/* KPIs (C2) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-border/60 bg-card/60 p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
                  <k.icon className="h-4 w-4 text-violet-500" />
                </span>
              </div>
              <div className="mt-3 font-[var(--font-space-grotesk)] text-3xl font-semibold tabular-nums">
                {k.valor}
              </div>
            </div>
          ))}
        </div>

        {/* Vendas por estado (C3 + Mapa do Brasil) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Vendas por estado</h2>
          <BrazilMap data={mapData} metric="Faturamento" />
        </section>
      </div>
    </PageShell>
  );
}
