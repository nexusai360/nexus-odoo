import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea } from "@/lib/diretoria/access";
import {
  queryIndicadoresEstoque, queryEstoquePorLocal, queryEstoquePorFamilia,
  queryEstoquePorMarca, queryCatalogoEstoque, queryComprasPorFornecedor,
  queryComprasAtivas, queryResumoCompras, queryIndicadoresAvancadosEstoque,
  querySeriais, queryComprasSerie, queryEstoqueGranular,
} from "@/lib/diretoria/queries/estoque";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import { ConstrutorGrid } from "@/components/diretoria/builder/construtor-grid";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";

export const dynamic = "force-dynamic";

// Layout oficial padrão (em código) usado quando não há nada salvo no banco.
const PADRAO_ESTOQUE: BlocoLayout[] = [
  { componenteId: "A-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
  { componenteId: "A-09", ordem: 1, largura: 8, altura: 2, x: 0, y: 2 },
  { componenteId: "A-10", ordem: 2, largura: 8, altura: 6, x: 0, y: 4 },
  { componenteId: "A-11", ordem: 3, largura: 8, altura: 5, x: 0, y: 10 },
  { componenteId: "A-03", ordem: 4, largura: 4, altura: 5, x: 0, y: 15 },
  { componenteId: "A-04", ordem: 5, largura: 4, altura: 5, x: 4, y: 15 },
  { componenteId: "A-02", ordem: 6, largura: 4, altura: 5, x: 0, y: 20 },
  { componenteId: "A-05", ordem: 7, largura: 4, altura: 5, x: 4, y: 20 },
  { componenteId: "A-07", ordem: 8, largura: 8, altura: 5, x: 0, y: 25 },
  { componenteId: "A-08", ordem: 9, largura: 5, altura: 5, x: 0, y: 30 },
  { componenteId: "K-01", ordem: 10, largura: 3, altura: 5, x: 5, y: 30 },
  { componenteId: "A-06", ordem: 11, largura: 4, altura: 5, x: 0, y: 35 },
];

export default async function DiretoriaRelatoriosPage() {
  const user = await requireDiretoriaArea("estoque");
  const hoje = new Date();

  const [
    indicadores, porLocal, porFamilia, porMarca, catalogo,
    comprasFornecedor, comprasAtivas, resumoCompras, avancados, seriais, comprasSerie, granular, salvo, freshIso,
  ] = await Promise.all([
    queryIndicadoresEstoque(prisma),
    queryEstoquePorLocal(prisma),
    queryEstoquePorFamilia(prisma),
    queryEstoquePorMarca(prisma),
    queryCatalogoEstoque(prisma, 500),
    queryComprasPorFornecedor(prisma, {}),
    queryComprasAtivas(prisma, hoje, 200),
    queryResumoCompras(prisma, hoje),
    queryIndicadoresAvancadosEstoque(prisma, hoje),
    querySeriais(prisma, hoje, 200),
    queryComprasSerie(prisma),
    queryEstoqueGranular(prisma),
    carregarLayout(prisma, "estoque", user.id),
    ultimaSyncIso(prisma),
  ]);

  const data: EstoqueData = {
    indicadores, avancados, porLocal, porFamilia, porMarca, catalogo, seriais,
    comprasFornecedor, comprasAtivas, resumoCompras, comprasSerie, granular,
  };
  const layoutInicial = salvo.length ? salvo : PADRAO_ESTOQUE;
  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Estoque & Compras (montável)"
        subtitle="Tela montada por componentes. Edite para reorganizar em quadrantes 8×8."
        actions={<FreshnessBadge iso={freshIso} />}
      />
      <ConstrutorGrid
        tela="estoque"
        data={data}
        layoutInicial={layoutInicial}
        dominios={["A", "K"]}
        podeEditarPessoal
        podeEditarGlobal={podeEditarGlobal}
      />
    </PageShell>
  );
}
