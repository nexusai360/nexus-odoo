import { Truck } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs } from "@/lib/diretoria/access";
import {
  queryIndicadoresDemandas, queryDemandasPorUf, queryDemandasPendentes,
} from "@/lib/diretoria/queries/pedidos";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import { ConstrutorPedidos } from "@/components/diretoria/builder/construtor-pedidos";
import type { PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";

export const dynamic = "force-dynamic";

const PADRAO_PEDIDOS: BlocoLayout[] = [
  { componenteId: "B-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
  { componenteId: "B-02", ordem: 1, largura: 5, altura: 6, x: 0, y: 2 },
  { componenteId: "B-05", ordem: 2, largura: 3, altura: 6, x: 5, y: 2 },
  { componenteId: "B-04", ordem: 3, largura: 8, altura: 6, x: 0, y: 8 },
];

export default async function DiretoriaRelatoriosPedidosPage() {
  const user = await requireDiretoriaArea("pedidos");
  const ufs = await userUfs(user);
  const hoje = new Date();

  const [indicadores, porUf, pendentes, aReceber, salvo, freshIso] = await Promise.all([
    queryIndicadoresDemandas(prisma, hoje),
    queryDemandasPorUf(prisma, { ufs }),
    queryDemandasPendentes(prisma, hoje, { ufs }),
    queryContasAReceber(prisma, {}, hoje),
    carregarLayout(prisma, "pedidos", user.id),
    ultimaSyncIso(prisma),
  ]);

  const data: PedidosData = {
    indicadores,
    aReceber: aReceber.totalAReceber,
    porUf,
    pendentes,
  };
  const layoutInicial = salvo.length ? salvo : PADRAO_PEDIDOS;
  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Truck}
        title="Pedidos & Entregas (montável)"
        subtitle="Tela montada por componentes. Edite para reorganizar em quadrantes 8×8."
        actions={<FreshnessBadge iso={freshIso} />}
      />
      <ConstrutorPedidos
        tela="pedidos"
        data={data}
        layoutInicial={layoutInicial}
        dominios={["B"]}
        podeEditarPessoal
        podeEditarGlobal={podeEditarGlobal}
      />
    </PageShell>
  );
}
