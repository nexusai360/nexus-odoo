import { Boxes } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { aquecerCorte } from "@/lib/corte-app";
import { requireDiretoriaArea, canDiretoria } from "@/lib/diretoria/access";
import {
  queryIndicadoresEstoque,
  queryEstoquePorLocal,
  queryEstoquePorFamilia,
  queryEstoquePorMarca,
  queryCatalogoEstoque,
  queryComprasPorFornecedor,
  queryComprasAtivas,
  queryResumoCompras,
  queryIndicadoresAvancadosEstoque,
  querySeriais,
  queryComprasSerie,
  queryEstoqueGranular,
  queryEstoqueDisponivelDiretoria,
} from "@/lib/diretoria/queries/estoque";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { type EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import { EstoqueMontavel } from "@/components/diretoria/estoque/estoque-montavel";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

export const dynamic = "force-dynamic";

export default async function DiretoriaEstoquePage() {
  const user = await requireDiretoriaArea("estoque");
  await aquecerCorte();
  const hoje = new Date();

  const [
    indicadores, porLocal, porFamilia, porMarca, catalogo,
    comprasFornecedor, comprasAtivas, resumoCompras, avancados, seriais,
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
  ]);
  const [comprasSerie, granular, estoqueDisponivel] = await Promise.all([
    queryComprasSerie(prisma),
    queryEstoqueGranular(prisma),
    queryEstoqueDisponivelDiretoria(prisma, { limite: 300 }),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const data: EstoqueData = {
    indicadores,
    avancados,
    porLocal,
    porFamilia,
    porMarca,
    catalogo,
    seriais,
    comprasFornecedor,
    comprasAtivas,
    resumoCompras,
    comprasSerie,
    granular,
    estoqueDisponivel,
  };

  const podeEditarGlobal = user.platformRole === "super_admin" || user.platformRole === "admin";
  const PADROES_ABA: Record<string, BlocoLayout[]> = {
    visao: [
      { componenteId: "A-01", ordem: 0, largura: 8, altura: 2, x: 0, y: 0 },
      { componenteId: "A-09", ordem: 1, largura: 8, altura: 2, x: 0, y: 2 },
      { componenteId: "A-03", ordem: 2, largura: 4, altura: 4, x: 0, y: 4 },
      { componenteId: "A-04", ordem: 3, largura: 4, altura: 4, x: 4, y: 4 },
    ],
    estoque: [
      { componenteId: "A-02", ordem: 0, largura: 4, altura: 5, x: 0, y: 0 },
      { componenteId: "A-05", ordem: 1, largura: 4, altura: 5, x: 4, y: 0 },
      { componenteId: "A-12", ordem: 2, largura: 8, altura: 6, x: 0, y: 5 },
    ],
    distribuicao: [
      { componenteId: "A-11", ordem: 0, largura: 8, altura: 5, x: 0, y: 0 },
      { componenteId: "A-03", ordem: 1, largura: 4, altura: 4, x: 0, y: 5 },
      { componenteId: "A-04", ordem: 2, largura: 4, altura: 4, x: 4, y: 5 },
    ],
    seriais: [{ componenteId: "A-06", ordem: 0, largura: 8, altura: 6, x: 0, y: 0 }],
    compras: [
      { componenteId: "A-10", ordem: 0, largura: 8, altura: 5, x: 0, y: 0 },
      { componenteId: "A-07", ordem: 1, largura: 8, altura: 5, x: 0, y: 5 },
    ],
    fornecedores: [
      { componenteId: "A-08", ordem: 0, largura: 4, altura: 6, x: 0, y: 0 },
      { componenteId: "K-01", ordem: 1, largura: 4, altura: 6, x: 4, y: 0 },
    ],
  };
  const abasIds = Object.keys(PADROES_ABA);
  const salvosPorAba = await Promise.all(
    abasIds.map((aba) => carregarLayout(prisma, `estoque:${aba}`, user.id)),
  );
  const layoutsPorAba: Record<string, BlocoLayout[]> = {};
  abasIds.forEach((aba, i) => {
    layoutsPorAba[aba] = salvosPorAba[i].length ? salvosPorAba[i] : PADROES_ABA[aba];
  });

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Boxes}
        title="Estoque & Compras"
        subtitle="Estoque por local, distribuição, seriais e compras por fornecedor."
        actions={
          <div className="flex items-center gap-3">
            <FreshnessBadge iso={freshIso} />
            {podeSync ? <SyncNowButton area="estoque" /> : null}
          </div>
        }
      />
      <EstoqueMontavel data={data} layoutsPorAba={layoutsPorAba} podeEditarGlobal={podeEditarGlobal} />
    </PageShell>
  );
}
