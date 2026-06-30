import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import { SEM_UF } from "@/lib/diretoria/uf";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
  queryVendasPorMarca,
} from "@/lib/diretoria/queries/vendas";
import { queryIndicadoresDemandas } from "@/lib/diretoria/queries/pedidos";
import { queryIndicadoresEstoque, queryEstoquePorFamilia } from "@/lib/diretoria/queries/estoque";
import { queryContasAReceber, queryContasAPagar } from "@/lib/reports/queries/financeiro";
import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
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
  const sp = await searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const periodo = resolverPeriodoDir(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    new Date(),
  );
  const ufs = await userUfs(user);
  const hoje = new Date();
  const filtros = { periodoDe: isoDia(periodo.de), periodoAte: isoDia(periodo.ate), ufs };

  const [vendas, vendasUf, vendasMarca, demandas, estoque, estoqueFamilia, aReceber, aPagar] =
    await Promise.all([
      queryIndicadoresVendas(prisma, filtros),
      queryVendasPorUf(prisma, filtros),
      queryVendasPorMarca(prisma, filtros),
      queryIndicadoresDemandas(prisma, hoje),
      queryIndicadoresEstoque(prisma),
      queryEstoquePorFamilia(prisma),
      queryContasAReceber(prisma, {}, hoje),
      queryContasAPagar(prisma, {}, hoje),
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
    aPagar: aPagar.totalAPagar,
    valorEstoque: estoque.valorTotal,
    produtos: estoque.produtos,
    demandasTotal: demandas.totalPendentes,
    demandasAtrasadas: demandas.atrasadas,
    // Mantém o bucket "Sem UF" (uf "??") como pseudo-estado SEM_UF, para o total
    // do mapa bater com o KPI de faturamento (mesma query agrupada por UF).
    mapData: vendasUf.linhas.map((l) => ({ uf: l.uf === "??" ? SEM_UF : l.uf, valor: l.valorTotal })),
    vendasMarca: vendasMarca.linhas.map((m) => ({ label: m.marca, valor: m.valorTotal })),
    estoqueFamilia: estoqueFamilia.linhas.map((f) => ({ label: f.chave, valor: f.valorTotal })),
    atalhos,
  };

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Visão geral"
        subtitle="Painel executivo da diretoria: indicadores, mapa do Brasil e atalhos."
        actions={<FreshnessBadge iso={freshIso} />}
      />
      <div className="flex flex-col gap-5">
        <DiretoriaPeriodBar />
        <VisaoGeralScreen data={data} />
      </div>
    </PageShell>
  );
}
