import { Boxes, Package, Layers, Warehouse } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea, canDiretoria } from "@/lib/diretoria/access";
import {
  queryIndicadoresEstoque,
  queryEstoquePorLocal,
  queryEstoquePorFamilia,
  queryComprasPorFornecedor,
} from "@/lib/diretoria/queries/estoque";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

function TabelaValor({
  titulo,
  rotulo,
  linhas,
}: {
  titulo: string;
  rotulo: string;
  linhas: { chave: string; quantidade: number; valorTotal: number }[];
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
      <h2 className="mb-4 text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">{rotulo}</th>
              <th className="pb-2 text-right font-medium">Itens</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.slice(0, 10).map((l) => (
              <tr key={l.chave} className="border-b border-border/20">
                <td className="py-2">{l.chave}</td>
                <td className="py-2 text-right tabular-nums">{num.format(Math.round(l.quantidade))}</td>
                <td className="py-2 text-right tabular-nums">{brl.format(l.valorTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function DiretoriaEstoquePage() {
  const user = await requireDiretoriaArea("estoque");

  const [indicadores, porLocal, porFamilia, compras] = await Promise.all([
    queryIndicadoresEstoque(prisma),
    queryEstoquePorLocal(prisma),
    queryEstoquePorFamilia(prisma),
    queryComprasPorFornecedor(prisma, {}),
  ]);

  const podeSync = await canDiretoria(user, "diretoria.sync.force");
  const freshIso = await ultimaSyncIso(prisma);

  const kpis = [
    { label: "Valor em estoque", valor: brl.format(indicadores.valorTotal), icon: Boxes },
    { label: "Itens em estoque", valor: num.format(Math.round(indicadores.itens)), icon: Package },
    { label: "Produtos distintos", valor: num.format(indicadores.produtos), icon: Layers },
    { label: "Locais", valor: num.format(indicadores.locais), icon: Warehouse },
  ];

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Boxes}
        title="Estoque & Compras"
        subtitle="Estoque por local, distribuição e compras por fornecedor."
        actions={
          <div className="flex items-center gap-3">
            <FreshnessBadge iso={freshIso} />
            {podeSync ? <SyncNowButton area="estoque" /> : null}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {/* Indicadores (A4) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10">
                  <k.icon className="h-4 w-4 text-violet-500" />
                </span>
              </div>
              <div className="mt-3 font-[var(--font-space-grotesk)] text-2xl font-semibold tabular-nums">
                {k.valor}
              </div>
            </div>
          ))}
        </div>

        {/* Estoque por local (A2) + distribuição por família (A5) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TabelaValor titulo="Estoque por local" rotulo="Local" linhas={porLocal.linhas} />
          <TabelaValor titulo="Distribuição por família" rotulo="Família" linhas={porFamilia.linhas} />
        </div>

        {/* Compras por fornecedor (A8) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Compras por fornecedor</h2>
          {compras.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem compras registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Fornecedor</th>
                  <th className="pb-2 text-right font-medium">Notas</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {compras.linhas.slice(0, 15).map((c) => (
                  <tr key={c.fornecedor} className="border-b border-border/20">
                    <td className="py-2">{c.fornecedor}</td>
                    <td className="py-2 text-right tabular-nums">{num.format(c.notas)}</td>
                    <td className="py-2 text-right tabular-nums">{brl.format(c.valorTotal)}</td>
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
