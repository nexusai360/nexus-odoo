import { Boxes, Package, Layers, Warehouse, ShoppingCart, Wallet, AlertTriangle } from "lucide-react";

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
  querySeriais,
} from "@/lib/diretoria/queries/estoque";
import type { StatusPrazo } from "@/lib/diretoria/cores";
import { SyncNowButton } from "@/components/diretoria/sync-now-button";
import { FreshnessBadge } from "@/components/diretoria/freshness-badge";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

// Prazo como pílula semântica: cor + texto (não depende só de cor).
function PrazoBadge({ status, dias }: { status: StatusPrazo | null; dias: number | null }) {
  if (status === null || dias === null) {
    return <span className="text-xs text-muted-foreground">Sem previsão</span>;
  }
  const estilo: Record<StatusPrazo, string> = {
    no_prazo: "bg-emerald-500/10 text-emerald-500",
    atencao: "bg-amber-500/10 text-amber-500",
    atrasado: "bg-rose-500/10 text-rose-500",
  };
  const rotulo =
    status === "atrasado"
      ? `Atrasada ${Math.abs(dias)}d`
      : dias === 0
        ? "Vence hoje"
        : `Em ${dias}d`;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${estilo[status]}`}>
      {rotulo}
    </span>
  );
}

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

  const [indicadores, porLocal, porFamilia, porMarca, catalogo, compras, comprasAtivas, resumoCompras, seriais] =
    await Promise.all([
      queryIndicadoresEstoque(prisma),
      queryEstoquePorLocal(prisma),
      queryEstoquePorFamilia(prisma),
      queryEstoquePorMarca(prisma),
      queryCatalogoEstoque(prisma, 100),
      queryComprasPorFornecedor(prisma, {}),
      queryComprasAtivas(prisma, new Date(), 50),
      queryResumoCompras(prisma, new Date()),
      querySeriais(prisma, new Date(), 50),
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

        {/* Estoque por local (A2) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TabelaValor titulo="Estoque por local" rotulo="Local" linhas={porLocal.linhas} />
          <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <h2 className="mb-4 text-sm font-semibold">Distribuição por família</h2>
            <DonutChart data={porFamilia.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} />
          </section>
        </div>

        {/* Distribuição por marca (A5) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Distribuição por marca</h2>
          <DonutChart data={porMarca.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} />
        </section>

        {/* Modelos do catálogo em estoque (A3) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Modelos do catálogo em estoque</h2>
          {catalogo.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem modelos em estoque.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Modelo</th>
                    <th className="pb-2 font-medium">Família</th>
                    <th className="pb-2 font-medium">Marca</th>
                    <th className="pb-2 text-right font-medium">Qtd</th>
                    <th className="pb-2 text-right font-medium">Locais</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogo.linhas.slice(0, 20).map((m, i) => (
                    <tr key={`${m.produto}-${i}`} className="border-b border-border/20">
                      <td className="py-2">{m.produto}</td>
                      <td className="py-2 text-muted-foreground">{m.familia ?? ","}</td>
                      <td className="py-2 text-muted-foreground">{m.marca ?? ","}</td>
                      <td className="py-2 text-right tabular-nums">{num.format(Math.round(m.quantidade))}</td>
                      <td className="py-2 text-right tabular-nums">{num.format(m.locais)}</td>
                      <td className="py-2 text-right tabular-nums">{brl.format(m.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Mostrando {Math.min(20, catalogo.linhas.length)} de {num.format(catalogo.total)} modelos
            distintos em estoque.
          </p>
        </section>

        {/* Resumo de compras + matriz por fornecedor (A8) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Resumo de compras (ordens)</h2>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Comprado", valor: brl.format(resumoCompras.totalComprado) },
              { label: "Pago", valor: brl.format(resumoCompras.totalPago) },
              { label: "A pagar", valor: brl.format(resumoCompras.totalAPagar) },
              { label: "Ativas", valor: num.format(resumoCompras.comprasAtivas) },
              { label: "Atrasadas", valor: num.format(resumoCompras.atrasadas) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-base font-semibold tabular-nums">{k.valor}</div>
              </div>
            ))}
          </div>
          {resumoCompras.fornecedores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem compras registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Fornecedor</th>
                    <th className="pb-2 text-right font-medium">Ativas</th>
                    <th className="pb-2 text-right font-medium">Comprado</th>
                    <th className="pb-2 text-right font-medium">Pago</th>
                    <th className="pb-2 text-right font-medium">A pagar</th>
                    <th className="pb-2 text-right font-medium">Atrasadas</th>
                  </tr>
                </thead>
                <tbody>
                  {resumoCompras.fornecedores.slice(0, 15).map((f) => (
                    <tr key={f.fornecedor} className="border-b border-border/20">
                      <td className="py-2">{f.fornecedor}</td>
                      <td className="py-2 text-right tabular-nums">{num.format(f.ativas)}</td>
                      <td className="py-2 text-right tabular-nums">{brl.format(f.comprado)}</td>
                      <td className="py-2 text-right tabular-nums">{brl.format(f.pago)}</td>
                      <td className="py-2 text-right tabular-nums">{brl.format(f.aPagar)}</td>
                      <td className={`py-2 text-right tabular-nums ${f.atrasadas > 0 ? "text-rose-500" : ""}`}>
                        {num.format(f.atrasadas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Compras por fornecedor (A8) , notas de entrada por fornecedor */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Compras por fornecedor (notas de entrada)</h2>
          <DonutChart data={compras.linhas.map((c) => ({ label: c.fornecedor, valor: c.valorTotal }))} />
        </section>

        {/* Compras ativas (A7) , ordens de compra não recebidas */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Compras ativas</h2>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Compras ativas",
                valor: num.format(comprasAtivas.total),
                icon: ShoppingCart,
                cor: "text-violet-500 bg-violet-600/10",
              },
              {
                label: "Valor em aberto",
                valor: brl.format(comprasAtivas.valorTotal),
                icon: Wallet,
                cor: "text-violet-500 bg-violet-600/10",
              },
              {
                label: "Atrasadas",
                valor: num.format(comprasAtivas.atrasadas),
                icon: AlertTriangle,
                cor:
                  comprasAtivas.atrasadas > 0
                    ? "text-rose-500 bg-rose-500/10"
                    : "text-emerald-500 bg-emerald-500/10",
              },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border/50 bg-background/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${k.cor}`}>
                    <k.icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums">{k.valor}</div>
              </div>
            ))}
          </div>
          {comprasAtivas.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma compra ativa no momento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Número</th>
                    <th className="pb-2 font-medium">Fornecedor</th>
                    <th className="pb-2 font-medium">Comprador</th>
                    <th className="pb-2 font-medium">Etapa</th>
                    <th className="pb-2 font-medium">Prazo</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {comprasAtivas.linhas.map((c, i) => (
                    <tr key={c.numero ?? i} className="border-b border-border/20">
                      <td className="py-2 font-medium tabular-nums">{c.numero ?? ","}</td>
                      <td className="py-2">{c.fornecedor ?? ","}</td>
                      <td className="py-2 text-muted-foreground">{c.comprador ?? ","}</td>
                      <td className="py-2">
                        {c.etapa ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">
                            {c.etapa}
                          </span>
                        ) : (
                          ","
                        )}
                      </td>
                      <td className="py-2">
                        <PrazoBadge status={c.statusPrazo} dias={c.diasRestantes} />
                      </td>
                      <td className="py-2 text-right tabular-nums">{brl.format(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Mostrando {comprasAtivas.linhas.length} de {num.format(comprasAtivas.total)} compras
            ativas (ordens não recebidas). Prazo só aparece quando há data prevista no pedido.
          </p>
        </section>

        {/* Lista de seriais (A6) */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <h2 className="mb-4 text-sm font-semibold">Seriais em estoque</h2>
          {seriais.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem seriais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Serial</th>
                    <th className="pb-2 font-medium">Produto</th>
                    <th className="pb-2 font-medium">Chegada</th>
                    <th className="pb-2 text-right font-medium">Idade (dias)</th>
                    <th className="pb-2 text-right font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {seriais.linhas.map((s, i) => (
                    <tr key={s.serial ?? i} className="border-b border-border/20">
                      <td className="py-2 tabular-nums">{s.serial}</td>
                      <td className="py-2">{s.produto ?? ","}</td>
                      <td className="py-2 text-muted-foreground">{s.chegada ?? ","}</td>
                      <td className="py-2 text-right tabular-nums">{s.idadeDias ?? ","}</td>
                      <td className="py-2 text-right tabular-nums">{brl.format(s.valorCusto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Mostrando {seriais.linhas.length} de {num.format(seriais.total)} seriais em estoque.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
