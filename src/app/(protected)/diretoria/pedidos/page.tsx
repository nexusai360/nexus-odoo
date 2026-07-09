import { Truck } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import {
  queryIndicadoresDemandas,
  queryDemandasPorUf,
  queryDemandasPendentes,
  queryDemandaPorEtapa,
  queryDemandasMaisParadas,
} from "@/lib/diretoria/queries/pedidos";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { type PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";
import { PedidosMontavel } from "@/components/diretoria/pedidos/pedidos-montavel";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

export const dynamic = "force-dynamic";

export default async function DiretoriaPedidosPage() {
  const user = await requireDiretoriaArea("pedidos");
  const ufs = await userUfs(user);
  const hoje = new Date();

  const [indicadores, porUf, pendentes, porEtapa, maisParadas, aReceber] = await Promise.all([
    queryIndicadoresDemandas(prisma, hoje, { ufs }),
    queryDemandasPorUf(prisma, { ufs }),
    queryDemandasPendentes(prisma, hoje, { ufs }),
    queryDemandaPorEtapa(prisma, { ufs }),
    queryDemandasMaisParadas(prisma, hoje, { ufs, limite: 50 }),
    queryContasAReceber(prisma, {}, hoje),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const data: PedidosData = {
    indicadores,
    aReceber: aReceber.totalAReceber,
    porUf,
    pendentes,
    porEtapa: porEtapa.linhas,
    maisParadas: maisParadas.linhas,
  };

  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";
  const PADROES_ABA: Record<string, BlocoLayout[]> = {
    visao: [
      { componenteId: "B-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
      { componenteId: "B-02", ordem: 1, largura: 5, altura: 6, x: 0, y: 2 },
      { componenteId: "B-05", ordem: 2, largura: 3, altura: 6, x: 5, y: 2 },
      { componenteId: "B-06", ordem: 3, largura: 8, altura: 4, x: 0, y: 8 },
    ],
    mapa: [{ componenteId: "B-02", ordem: 0, largura: 8, altura: 6, x: 0, y: 0 }],
    pendentes: [
      { componenteId: "B-04", ordem: 0, largura: 8, altura: 6, x: 0, y: 0 },
      { componenteId: "B-07", ordem: 1, largura: 8, altura: 6, x: 0, y: 6 },
    ],
  };
  const abasIds = Object.keys(PADROES_ABA);
  const salvosPorAba = await Promise.all(
    abasIds.map((aba) => carregarLayout(prisma, `pedidos:${aba}`, user.id)),
  );
  const layoutsPorAba: Record<string, BlocoLayout[]> = {};
  abasIds.forEach((aba, i) => {
    layoutsPorAba[aba] = salvosPorAba[i].length ? salvosPorAba[i] : PADROES_ABA[aba];
  });

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
      <PedidosMontavel data={data} layoutsPorAba={layoutsPorAba} podeEditarGlobal={podeEditarGlobal} />
    </PageShell>
  );
}
