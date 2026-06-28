import { Truck, PackageCheck, AlertTriangle, HandCoins } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import {
  requireDiretoriaArea,
  userUfs,
  canDiretoria,
} from "@/lib/diretoria/access";
import {
  queryIndicadoresDemandas,
  queryDemandasPorUf,
  queryDemandasPendentes,
} from "@/lib/diretoria/queries/pedidos";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { PedidosPendentesTable } from "@/components/diretoria/pedidos-pendentes-table";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

export default async function DiretoriaPedidosPage() {
  const user = await requireDiretoriaArea("pedidos");
  const ufs = await userUfs(user);
  const hoje = new Date();

  const [indicadores, demandasUf, pendentes, aReceber] = await Promise.all([
    queryIndicadoresDemandas(prisma, hoje),
    queryDemandasPorUf(prisma, { ufs }),
    queryDemandasPendentes(prisma, hoje, { ufs }),
    queryContasAReceber(prisma, {}, hoje),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);
  const mapData = demandasUf.linhas
    .filter((l) => l.uf !== "??")
    .map((l) => ({ uf: l.uf, valor: l.valorTotal }));

  const kpis = [
    { label: "Demandas a entregar", valor: num.format(indicadores.totalPendentes), icon: Truck },
    { label: "Valor a entregar", valor: brl.format(indicadores.valorAEntregar), icon: PackageCheck },
    { label: "Atrasadas", valor: num.format(indicadores.atrasadas), icon: AlertTriangle },
    { label: "A receber de clientes", valor: brl.format(aReceber.totalAReceber), icon: HandCoins },
  ];

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Truck}
        title="Pedidos & Entregas"
        subtitle="Demandas a entregar, dívida com clientes e mapa de demandas por estado."
        actions={
          <div className="flex items-center gap-3">
            <FreshnessBadge iso={freshIso} />
            {podeSync ? <SyncNowButton area="pedidos" /> : null}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {/* Indicadores (B6 + B3) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
                  <k.icon className="h-4 w-4 text-violet-500" />
                </span>
              </div>
              <div className="mt-3 font-[var(--font-space-grotesk)] text-2xl font-semibold tabular-nums">
                {k.valor}
              </div>
            </div>
          ))}
        </div>

        {/* Mapa de demandas por estado (B4) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Mapa de demandas por estado</h2>
          <BrazilMap data={mapData} metric="Valor a entregar" />
        </section>

        {/* Lista de pedidos pendentes (B2) + drill-in do pedido (B5) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Pedidos pendentes</h2>
          <PedidosPendentesTable linhas={pendentes.linhas} />
        </section>
      </div>
    </PageShell>
  );
}
