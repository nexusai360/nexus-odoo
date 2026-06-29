import { TrendingUp } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs } from "@/lib/diretoria/access";
import {
  queryIndicadoresVendas, queryVendasPorUf, queryVendasPorMarca,
  queryFormasPagamento, queryModalidadesEMaiorPedido, queryMargemEstimada,
} from "@/lib/diretoria/queries/vendas";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import { ConstrutorVendas } from "@/components/diretoria/builder/construtor-vendas";
import type { VendasData } from "@/components/diretoria/vendas/vendas-screen";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";

export const dynamic = "force-dynamic";

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

// Layout oficial padrão (em código) , variedade de visualização: KPIs, mapa,
// ranking, barras, donut e distribuição dinâmica.
const PADRAO_VENDAS: BlocoLayout[] = [
  { componenteId: "C-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
  { componenteId: "C-02", ordem: 1, largura: 5, altura: 6, x: 0, y: 2 },
  { componenteId: "C-04", ordem: 2, largura: 3, altura: 6, x: 5, y: 2 },
  { componenteId: "C-03", ordem: 3, largura: 4, altura: 5, x: 0, y: 8 },
  { componenteId: "C-07", ordem: 4, largura: 4, altura: 5, x: 4, y: 8 },
  { componenteId: "C-09", ordem: 5, largura: 8, altura: 5, x: 0, y: 13 },
  { componenteId: "C-05", ordem: 6, largura: 8, altura: 4, x: 0, y: 18 },
];

export default async function DiretoriaRelatoriosVendasPage() {
  const user = await requireDiretoriaArea("vendas");
  const hoje = new Date();
  const umAnoAtras = new Date(hoje);
  umAnoAtras.setFullYear(hoje.getFullYear() - 1);
  const ufs = await userUfs(user);
  const filtros = { periodoDe: isoDia(umAnoAtras), periodoAte: isoDia(hoje), ufs };

  const [indicadores, porUf, porMarca, formasPagamento, modais, margem, salvo, freshIso] = await Promise.all([
    queryIndicadoresVendas(prisma, filtros),
    queryVendasPorUf(prisma, filtros),
    queryVendasPorMarca(prisma, filtros),
    queryFormasPagamento(prisma, filtros),
    queryModalidadesEMaiorPedido(prisma, filtros),
    queryMargemEstimada(prisma, filtros),
    carregarLayout(prisma, "vendas", user.id),
    ultimaSyncIso(prisma),
  ]);

  const data: VendasData = {
    indicadores, margem, porUf, porMarca, formasPagamento,
    modalidades: modais.modalidades, maiorPedido: modais.maiorPedido,
  };
  const layoutInicial = salvo.length ? salvo : PADRAO_VENDAS;
  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Vendas (montável)"
        subtitle="Tela montada por componentes. Edite para reorganizar em quadrantes 8×8."
        actions={<FreshnessBadge iso={freshIso} />}
      />
      <ConstrutorVendas
        tela="vendas"
        data={data}
        layoutInicial={layoutInicial}
        dominios={["C"]}
        podeEditarPessoal
        podeEditarGlobal={podeEditarGlobal}
      />
    </PageShell>
  );
}
