import { TrendingUp } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
  queryVendasPorMarca,
  queryFormasPagamento,
  queryModalidadesEMaiorPedido,
  queryMargemEstimada,
} from "@/lib/diretoria/queries/vendas";
import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { VendasScreen, type VendasData } from "@/components/diretoria/vendas/vendas-screen";

export const dynamic = "force-dynamic";

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

  const [indicadores, porUf, porMarca, formasPagamento, modais, margem] = await Promise.all([
    queryIndicadoresVendas(prisma, filtros),
    queryVendasPorUf(prisma, filtros),
    queryVendasPorMarca(prisma, filtros),
    queryFormasPagamento(prisma, filtros),
    queryModalidadesEMaiorPedido(prisma, filtros),
    queryMargemEstimada(prisma, filtros),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const data: VendasData = {
    indicadores,
    margem,
    porUf,
    porMarca,
    formasPagamento,
    modalidades: modais.modalidades,
    maiorPedido: modais.maiorPedido,
  };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Vendas"
        subtitle="Faturamento, vendas por estado e marca, modalidades e formas de pagamento."
        actions={
          <div className="flex items-center gap-3">
            <FreshnessBadge iso={freshIso} />
            {podeSync ? <SyncNowButton area="vendas" /> : null}
          </div>
        }
      />
      <div className="flex flex-col gap-5">
        <DiretoriaPeriodBar />
        <VendasScreen data={data} />
      </div>
    </PageShell>
  );
}
