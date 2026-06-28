import { TrendingUp, ShoppingCart, Receipt } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, userUfs, canDiretoria } from "@/lib/diretoria/access";
import { resolverPeriodoDir } from "@/lib/diretoria/periodo";
import {
  queryIndicadoresVendas,
  queryVendasPorUf,
  queryVendasPorMarca,
  queryFormasPagamento,
  queryModalidadesEMaiorPedido,
} from "@/lib/diretoria/queries/vendas";
import { queryPedidosPorVendedor } from "@/lib/reports/queries/comercial";
import { queryProdutosFaturados } from "@/lib/reports/queries/fiscal";
import { DiretoriaPeriodBar } from "@/components/diretoria/diretoria-period-bar";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { VendasMapaComparativo } from "@/components/diretoria/vendas-mapa-comparativo";
import {
  VendasPorMarcaChart,
  FormasPagamentoChart,
} from "@/components/diretoria/vendas-charts";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("pt-BR");

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DiretoriaVendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireDiretoriaArea("vendas");
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

  const [
    indicadores,
    vendasUf,
    vendasMarca,
    formasPgto,
    modalidades,
    vendedores,
    itens,
  ] = await Promise.all([
      queryIndicadoresVendas(prisma, filtros),
      queryVendasPorUf(prisma, filtros),
      queryVendasPorMarca(prisma, filtros),
      queryFormasPagamento(prisma, filtros),
      queryModalidadesEMaiorPedido(prisma, filtros),
      queryPedidosPorVendedor(prisma, filtros),
      queryProdutosFaturados(prisma, { ...filtros, limit: 10, offset: 0 }),
    ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");

  const mapData = vendasUf.linhas
    .filter((l) => l.uf !== "??")
    .map((l) => ({ uf: l.uf, valor: l.valorTotal, quantidade: l.quantidade }));

  const kpis = [
    { label: "Faturamento", valor: brl.format(indicadores.faturamento), icon: TrendingUp },
    { label: "Pedidos no período", valor: num.format(indicadores.numPedidos), icon: ShoppingCart },
    { label: "Ticket médio", valor: brl.format(indicadores.ticketMedio), icon: Receipt },
  ];

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={TrendingUp}
        title="Vendas"
        subtitle="Faturamento, vendas por estado e marca, modalidades e formas de pagamento."
        actions={podeSync ? <SyncNowButton area="vendas" /> : undefined}
      />

      <div className="flex flex-col gap-6">
        <DiretoriaPeriodBar />

        {/* KPIs (C2) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-border/60 bg-card/60 p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
                  <k.icon className="h-4 w-4 text-violet-500" />
                </span>
              </div>
              <div className="mt-3 font-[var(--font-space-grotesk)] text-3xl font-semibold tabular-nums">
                {k.valor}
              </div>
            </div>
          ))}
        </div>

        {/* Vendas por estado (C3) + comparativo (C8/C9) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Vendas por estado</h2>
          <VendasMapaComparativo data={mapData} />
        </section>

        {/* Marca (C4) e formas de pagamento (C10) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <h2 className="mb-4 text-sm font-semibold">Vendas por marca</h2>
            <VendasPorMarcaChart data={vendasMarca.linhas} />
          </section>
          <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <h2 className="mb-4 text-sm font-semibold">Formas de pagamento</h2>
            <FormasPagamentoChart data={formasPgto.linhas} />
          </section>
        </div>

        {/* Modalidades + maior pedido (C6) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <h2 className="mb-4 text-sm font-semibold">Modalidades</h2>
            {modalidades.modalidades.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="space-y-2">
                {modalidades.modalidades.slice(0, 8).map((m) => (
                  <li key={m.modalidade} className="flex items-center justify-between text-sm">
                    <span>{m.modalidade}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {brl.format(m.valorTotal)}{" "}
                      <span className="text-xs">({num.format(m.quantidade)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <h2 className="mb-4 text-sm font-semibold">Maior pedido do período</h2>
            {modalidades.maiorPedido ? (
              <div className="flex h-full flex-col justify-center">
                <div className="font-[var(--font-space-grotesk)] text-3xl font-semibold tabular-nums">
                  {brl.format(modalidades.maiorPedido.valor)}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Pedido {modalidades.maiorPedido.numero ?? "?"}
                  {modalidades.maiorPedido.participante
                    ? ` , ${modalidades.maiorPedido.participante}`
                    : ""}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem pedidos no período.</p>
            )}
          </section>
        </div>

        {/* Itens vendidos no período (C7) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Itens mais vendidos</h2>
          {itens.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Produto</th>
                  <th className="pb-2 text-right font-medium">Quantidade</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {itens.linhas.map((it, i) => (
                  <tr key={it.produtoNome ?? i} className="border-b border-border/20">
                    <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2">{it.produtoNome ?? "Não informado"}</td>
                    <td className="py-2 text-right tabular-nums">{num.format(it.quantidadeTotal)}</td>
                    <td className="py-2 text-right tabular-nums">{brl.format(it.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Ranking de vendedores (C5) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Ranking de vendedores</h2>
          {vendedores.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Vendedor</th>
                  <th className="pb-2 text-right font-medium">Pedidos</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.linhas.slice(0, 10).map((v, i) => (
                  <tr key={v.vendedorNome ?? i} className="border-b border-border/20">
                    <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2">{v.vendedorNome ?? "Não informado"}</td>
                    <td className="py-2 text-right tabular-nums">{num.format(v.quantidade)}</td>
                    <td className="py-2 text-right tabular-nums">{brl.format(v.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}
