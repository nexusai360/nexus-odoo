import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { aquecerCorte } from "@/lib/corte-app";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import { SEM_UF } from "@/lib/diretoria/uf";
import { resolverPeriodoDir, resolverJanelaDemanda } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
  queryVendasPorMarca,
} from "@/lib/diretoria/queries/vendas";
import { queryIndicadoresDemandas } from "@/lib/diretoria/queries/pedidos";
import { queryIndicadoresEstoque, queryEstoquePorFamilia } from "@/lib/diretoria/queries/estoque";
import { queryContasAReceber, queryContasAPagar } from "@/lib/reports/queries/financeiro";
import { DiretoriaFiltros } from "@/components/diretoria/diretoria-filtros";
import { listarEmpresasDoFato } from "@/lib/metrics/_shared/empresa";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { VisaoGeralScreen, type VisaoGeralData } from "@/components/diretoria/visao-geral/visao-geral-screen";

export const dynamic = "force-dynamic";

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ATALHOS = [
  { href: "/diretoria/vendas", label: "Vendas", desc: "Faturamento, estados, marcas e pagamentos", cap: "diretoria.vendas.view" },
  { href: "/diretoria/pedidos", label: "Pedidos & Entregas", desc: "Demandas, dívida e mapa de entregas", cap: "diretoria.pedidos.view" },
  { href: "/diretoria/estoque", label: "Estoque & Compras", desc: "Estoque por local e compras por fornecedor", cap: "diretoria.estoque.view" },
];

export default async function DiretoriaVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("visao_geral");
  await aquecerCorte();
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const periodo = resolverPeriodoDir(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    new Date(),
  );
  const ufs = await userUfs(user);
  const hoje = new Date();

  // Recorte por empresa do grupo (searchParam `empresa`). Só aceita um empresaId que exista
  // no fato; qualquer outro valor cai no grupo inteiro, então URL adulterada não quebra a tela.
  const empresas = await listarEmpresasDoFato(prisma);
  const empresaParam = Number(param("empresa"));
  const empresaSel = Number.isFinite(empresaParam)
    ? empresas.find((e) => e.empresaId === empresaParam)
    : undefined;

  const filtros = {
    periodoDe: isoDia(periodo.de),
    periodoAte: isoDia(periodo.ate),
    ufs,
    empresaId: empresaSel?.empresaId,
  };

  // Teto da janela de cobranca. "Tudo" = sem teto (carteira inteira em aberto).
  const tetoCobranca = periodo.preset === "tudo" ? undefined : isoDia(periodo.ate);

  // Demanda a entregar segue a PILULA + empresa, NAO o corte de leitura (D8/D9/RF-A6): o card
  // da visao geral tem que bater com o relatorio e os blocos da tela de Pedidos para a mesma
  // pilula. "Tudo" abre do primeiro pedido (janela de demanda sem grampo no corte).
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

  const [vendas, vendasUf, vendasMarca, demandas, estoque, estoqueFamilia, aReceber, aPagar] =
    await Promise.all([
      queryIndicadoresVendas(prisma, filtros),
      queryVendasPorUf(prisma, filtros),
      queryVendasPorMarca(prisma, filtros),
      queryIndicadoresDemandas(prisma, hoje, fDemanda),
      queryIndicadoresEstoque(prisma),
      queryEstoquePorFamilia(prisma),
      // Janela de cobranca: vencido + vencendo ate o fim do periodo em analise.
      //
      // "Tudo" NAO tem fim de periodo: e a carteira inteira em aberto (vencido + a vencer).
      // O preset "tudo" resolve `ate` como HOJE (o que e certo para faturamento, que nao tem
      // futuro), e passar esse `ate` como teto de cobranca fazia "Tudo" mostrar MENOS que
      // "este mes" , so o vencido. Medido em producao (a receber): mes R$ 18,1 mi, ano
      // R$ 56,8 mi, "tudo" R$ 9,6 mi. Um periodo maior nao pode somar menos.
      queryContasAReceber(prisma, { periodoAte: tetoCobranca }, hoje),
      queryContasAPagar(prisma, { periodoAte: tetoCobranca }, hoje),
    ]);

  const atalhos = [];
  for (const a of ATALHOS) {
    if (await canDiretoria(user, a.cap)) atalhos.push({ href: a.href, label: a.label, desc: a.desc });
  }

  const freshIso = await ultimaSyncIso(prisma);

  const data: VisaoGeralData = {
    faturamento: vendas.faturamento,
    ticketMedio: vendas.ticketMedio,
    numPedidos: vendas.numPedidos,
    aReceber: aReceber.totalAReceber,
    carteiraAFaturar: aReceber.carteiraAFaturar,
    aPagar: aPagar.totalAPagar,
    valorEstoque: estoque.valorTotal,
    valorEstoqueACusto: estoque.valorACusto,
    indiceEstoque: estoque.indice,
    produtos: estoque.produtos,
    demandasTotal: demandas.totalPendentes,
    demandasAtrasadas: demandas.atrasadas,
    // Mantém o bucket "Sem UF" (uf "??") como pseudo-estado SEM_UF, para o total
    // do mapa bater com o KPI de faturamento (mesma query agrupada por UF).
    mapData: vendasUf.linhas.map((l) => ({ uf: l.uf === "??" ? SEM_UF : l.uf, valor: l.valorTotal })),
    vendasMarca: vendasMarca.linhas.map((m) => ({ label: m.marca, valor: m.valorTotal })),
    estoqueFamilia: estoqueFamilia.linhas.map((f) => ({ label: f.chave, valor: f.valorTotal })),
    atalhos,
    empresaNome: empresaSel?.nome ?? null,
  };

  const opcoesEmpresa = empresas.map((e) => ({
    empresaId: e.empresaId,
    nome: e.nome,
    // Desambigua as homônimas (matriz e filial com o mesmo nome base).
    detalhe:
      e.tipo === "desconhecido"
        ? null
        : `${e.tipo === "matriz" ? "Matriz" : "Filial"}${e.uf ? ` ${e.uf}` : ""}`,
  }));

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Visão geral"
        subtitle="Painel executivo da diretoria: indicadores, mapa do Brasil e atalhos."
        actions={<FreshnessBadge iso={freshIso} />}
      />
      <div className="flex flex-col gap-5">
        <DiretoriaFiltros empresas={opcoesEmpresa} />
        <VisaoGeralScreen data={data} />
      </div>
    </PageShell>
  );
}
