import { Boxes } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
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
} from "@/lib/diretoria/queries/estoque";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { EstoqueScreen, type EstoqueData } from "@/components/diretoria/estoque/estoque-screen";

export const dynamic = "force-dynamic";

export default async function DiretoriaEstoquePage() {
  const user = await requireDiretoriaArea("estoque");
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
  const [comprasSerie, granular] = await Promise.all([
    queryComprasSerie(prisma),
    queryEstoqueGranular(prisma),
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
  };

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
      <EstoqueScreen data={data} />
    </PageShell>
  );
}
