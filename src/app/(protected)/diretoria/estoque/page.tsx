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
  queryEstoqueDemonstracao,
  queryNecessidadeCompra,
} from "@/lib/diretoria/queries/estoque";
import { queryListaKits } from "@/lib/reports/queries/composicao-kit";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { DiretoriaFiltros } from "@/components/diretoria/diretoria-filtros";
import { listarEmpresasDoFato } from "@/lib/metrics/_shared/empresa";
import { opcoesDeEmpresa } from "@/lib/diretoria/empresa-opcoes";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import { type EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import { EstoqueMontavel } from "@/components/diretoria/estoque/estoque-montavel";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

export const dynamic = "force-dynamic";

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DiretoriaEstoquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("estoque");
  await aquecerCorte();
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const hoje = new Date();

  const periodo = resolverPeriodoDir(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    hoje,
  );
  const empresas = await listarEmpresasDoFato(prisma);
  const empresaParam = Number(param("empresa"));
  const empresaSel = Number.isFinite(empresaParam)
    ? empresas.find((e) => e.empresaId === empresaParam)
    : undefined;

  // O que o periodo recorta AQUI: compras (documento datado) e a demanda que entra na
  // necessidade de compra. O SALDO nao entra: estoque e foto do agora, "valor em estoque em
  // maio" nao existe no cache. Ver o cabecalho de queries/estoque.ts.
  const f = {
    periodoDe: isoDia(periodo.de),
    periodoAte: isoDia(periodo.ate),
    empresaId: empresaSel?.empresaId,
  };
  const fPeriodo = { periodoDe: f.periodoDe, periodoAte: f.periodoAte };

  const [
    indicadores, porLocal, porFamilia, porMarca, catalogo,
    comprasFornecedor, comprasAtivas, resumoCompras, avancados, seriais,
    demonstracao, necessidadeCompra,
  ] = await Promise.all([
    queryIndicadoresEstoque(prisma),
    queryEstoquePorLocal(prisma),
    queryEstoquePorFamilia(prisma),
    queryEstoquePorMarca(prisma),
    queryCatalogoEstoque(prisma, 500),
    queryComprasPorFornecedor(prisma, fPeriodo),
    queryComprasAtivas(prisma, hoje, 200, f),
    queryResumoCompras(prisma, hoje, f),
    queryIndicadoresAvancadosEstoque(prisma, hoje),
    querySeriais(prisma, 200),
    queryEstoqueDemonstracao(prisma),
    queryNecessidadeCompra(prisma, 100, fPeriodo),
  ]);
  const [comprasSerie, granular, estoqueDisponivel, listaKits] = await Promise.all([
    queryComprasSerie(prisma),
    queryEstoqueGranular(prisma),
    queryEstoqueDisponivelDiretoria(prisma, { limite: 300 }),
    queryListaKits(prisma),
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
    demonstracao,
    necessidadeCompra,
    listaKits,
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
      { componenteId: "A-14", ordem: 2, largura: 8, altura: 6, x: 0, y: 5 },
      { componenteId: "A-15", ordem: 3, largura: 8, altura: 6, x: 0, y: 11 },
      { componenteId: "A-13", ordem: 4, largura: 8, altura: 5, x: 0, y: 17 },
      { componenteId: "A-12", ordem: 5, largura: 8, altura: 6, x: 0, y: 22 },
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
      <DiretoriaFiltros
        empresas={opcoesDeEmpresa(empresas)}
        aviso={
          empresaSel
            ? "O estoque (valor, seriais, catálogo e necessidade de compra) é sempre do grupo inteiro: o saldo do Odoo não guarda a empresa dona. O recorte por empresa vale para as compras. O período recorta as compras e a demanda, nunca o saldo, que é a foto de agora."
            : "O período recorta as compras e a demanda. O saldo em estoque é sempre a foto de agora, não do período."
        }
      />
      <EstoqueMontavel data={data} layoutsPorAba={layoutsPorAba} podeEditarGlobal={podeEditarGlobal} />
    </PageShell>
  );
}
