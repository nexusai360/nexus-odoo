import { Truck } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import {
  queryIndicadoresDemandas,
  queryDemandasPorUf,
  queryDemandasPendentes,
} from "@/lib/diretoria/queries/pedidos";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { PedidosScreen, type PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";

export const dynamic = "force-dynamic";

export default async function DiretoriaPedidosPage() {
  const user = await requireDiretoriaArea("pedidos");
  const ufs = await userUfs(user);
  const hoje = new Date();

  const [indicadores, porUf, pendentes, aReceber] = await Promise.all([
    queryIndicadoresDemandas(prisma, hoje),
    queryDemandasPorUf(prisma, { ufs }),
    queryDemandasPendentes(prisma, hoje, { ufs }),
    queryContasAReceber(prisma, {}, hoje),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const data: PedidosData = {
    indicadores,
    aReceber: aReceber.totalAReceber,
    porUf,
    pendentes,
  };

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
      <PedidosScreen data={data} />
    </PageShell>
  );
}
