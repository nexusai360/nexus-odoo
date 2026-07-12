import { TrendingUp } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { aquecerCorte } from "@/lib/corte-app";
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
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { type VendasData } from "@/components/diretoria/vendas/vendas-screen";
import { VendasMontavel } from "@/components/diretoria/vendas/vendas-montavel";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

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
  await aquecerCorte();
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

  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";
  const PADROES_ABA: Record<string, BlocoLayout[]> = {
    visao: [
      { componenteId: "C-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
      { componenteId: "C-02", ordem: 1, largura: 5, altura: 6, x: 0, y: 2 },
      { componenteId: "C-04", ordem: 2, largura: 3, altura: 6, x: 5, y: 2 },
    ],
    estados: [
      { componenteId: "C-02", ordem: 0, largura: 5, altura: 6, x: 0, y: 0 },
      { componenteId: "C-04", ordem: 1, largura: 3, altura: 6, x: 5, y: 0 },
    ],
    marcas: [
      { componenteId: "C-03", ordem: 0, largura: 4, altura: 5, x: 0, y: 0 },
      { componenteId: "C-09", ordem: 1, largura: 4, altura: 5, x: 4, y: 0 },
    ],
    pagamentos: [
      { componenteId: "C-07", ordem: 0, largura: 4, altura: 5, x: 0, y: 0 },
      { componenteId: "C-05", ordem: 1, largura: 4, altura: 5, x: 4, y: 0 },
    ],
  };
  const abasIds = Object.keys(PADROES_ABA);
  const salvosPorAba = await Promise.all(
    abasIds.map((aba) => carregarLayout(prisma, `vendas:${aba}`, user.id)),
  );
  const layoutsPorAba: Record<string, BlocoLayout[]> = {};
  abasIds.forEach((aba, i) => {
    layoutsPorAba[aba] = salvosPorAba[i].length ? salvosPorAba[i] : PADROES_ABA[aba];
  });

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
      <VendasMontavel data={data} layoutsPorAba={layoutsPorAba} podeEditarGlobal={podeEditarGlobal} />
    </PageShell>
  );
}
