import { Truck } from "lucide-react";

import { DiretoriaShell } from "@/components/diretoria/modo-estendido";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { aquecerCorte } from "@/lib/corte-app";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import {
  queryIndicadoresDemandas,
  queryDemandasPorUf,
  queryDemandasPendentes,
  queryDemandaPorEtapa,
  queryDemandasMaisParadas,
} from "@/lib/diretoria/queries/pedidos";
import { queryEntregasParciais } from "@/lib/diretoria/queries/entregas-parciais";
import { queryContasAReceber } from "@/lib/reports/queries/financeiro";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { DiretoriaFiltros } from "@/components/diretoria/diretoria-filtros";
import { listarEmpresasDoFato } from "@/lib/metrics/_shared/empresa";
import { opcoesDeEmpresa } from "@/lib/diretoria/empresa-opcoes";
import { resolverJanelaDemanda } from "@/lib/diretoria/periodo";

import { type PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";
import { PedidosMontavel } from "@/components/diretoria/pedidos/pedidos-montavel";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

export const dynamic = "force-dynamic";

export default async function DiretoriaPedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("pedidos");
  await aquecerCorte();
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const ufs = await userUfs(user);
  const hoje = new Date();

  const empresas = await listarEmpresasDoFato(prisma);
  const empresaParam = Number(param("empresa"));
  const empresaSel = Number.isFinite(empresaParam)
    ? empresas.find((e) => e.empresaId === empresaParam)
    : undefined;

  // Demanda a entregar segue a PILULA de periodo, NAO o corte de leitura (D8/RF-A5): "Tudo"
  // abre do primeiro pedido. Os blocos de demanda recebem a janela de demanda (sem grampo no
  // corte); as contas a receber (financeiro) seguem o proprio corte, alheias a esta janela.
  const jd = resolverJanelaDemanda(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    hoje,
  );
  const fDemanda = {
    ufs,
    periodoDe: jd.periodoDe,
    periodoAte: jd.periodoAte,
    empresaId: empresaSel?.empresaId,
  };

  const [indicadores, porUf, pendentes, porEtapa, maisParadas, aReceber, entregasParciais] =
    await Promise.all([
      queryIndicadoresDemandas(prisma, hoje, fDemanda),
      queryDemandasPorUf(prisma, fDemanda),
      queryDemandasPendentes(prisma, hoje, fDemanda),
      queryDemandaPorEtapa(prisma, fDemanda),
      queryDemandasMaisParadas(prisma, hoje, { ...fDemanda, limite: 50 }),
      queryContasAReceber(prisma, {}, hoje),
      queryEntregasParciais(prisma, hoje, fDemanda),
    ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const data: PedidosData = {
    indicadores,
    aReceber: aReceber.totalAReceber,
    carteiraAFaturar: aReceber.carteiraAFaturar,
    porUf,
    pendentes,
    porEtapa: porEtapa.linhas,
    maisParadas: maisParadas.linhas,
    entregasParciais,
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
    entregas: [
      { componenteId: "B-08", ordem: 0, largura: 8, altura: 3, x: 0, y: 0 },
      { componenteId: "B-09", ordem: 1, largura: 8, altura: 8, x: 0, y: 3 },
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
    <DiretoriaShell>
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
      <DiretoriaFiltros
        empresas={opcoesDeEmpresa(empresas)}
        aviso="O período recorta os pedidos pela data do orçamento. As contas a receber seguem a janela de cobrança do período."
      />
      <PedidosMontavel data={data} layoutsPorAba={layoutsPorAba} podeEditarGlobal={podeEditarGlobal} />
    </DiretoriaShell>
  );
}
