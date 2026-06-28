// T7 , mapeia componenteId -> componente React renderizado com o dado PLANO do
// loader (server). Onda 1: A-01..A-04 (estoque). Mais componentes nas ondas
// seguintes. Sem recharts aqui (mantido server-side); gráficos definitivos vêm
// na Onda 2 com a biblioteca de charts.
import type { ReactNode } from "react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR");

interface Indicadores { valorTotal: number; itens: number; produtos: number; locais: number }
interface LinhaAgrupada { chave: string; quantidade: number; valorTotal: number }
interface Agrupado { linhas: LinhaAgrupada[]; valorGeral: number }

function KpisEstoque({ d }: { d: Indicadores }) {
  const cards = [
    { label: "Valor em estoque", valor: brl.format(d.valorTotal) },
    { label: "Itens", valor: num.format(Math.round(d.itens)) },
    { label: "Produtos", valor: num.format(d.produtos) },
    { label: "Locais", valor: num.format(d.locais) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border/50 bg-background/40 p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{c.valor}</div>
        </div>
      ))}
    </div>
  );
}

function TabelaAgrupada({ d, rotulo }: { d: Agrupado; rotulo: string }) {
  if (!d.linhas.length) return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="pb-2 font-medium">{rotulo}</th>
          <th className="pb-2 text-right font-medium">Itens</th>
          <th className="pb-2 text-right font-medium">Valor</th>
        </tr>
      </thead>
      <tbody>
        {d.linhas.slice(0, 10).map((l) => (
          <tr key={l.chave} className="border-b border-border/20">
            <td className="py-2">{l.chave}</td>
            <td className="py-2 text-right tabular-nums">{num.format(Math.round(l.quantidade))}</td>
            <td className="py-2 text-right tabular-nums">{brl.format(l.valorTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BarrasAgrupado({ d }: { d: Agrupado }) {
  if (!d.linhas.length) return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>;
  const top = d.linhas.slice(0, 6);
  const max = Math.max(...top.map((l) => l.valorTotal), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {top.map((l) => (
        <div key={l.chave}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-foreground/90">{l.chave}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{brl.format(l.valorTotal)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${(l.valorTotal / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Renderiza o componente concreto a partir do id e do dado do loader. */
export function renderComponente(id: string, dado: unknown): ReactNode {
  switch (id) {
    case "A-01":
      return <KpisEstoque d={dado as Indicadores} />;
    case "A-02":
      return <TabelaAgrupada d={dado as Agrupado} rotulo="Local" />;
    case "A-03":
      return <BarrasAgrupado d={dado as Agrupado} />;
    case "A-04":
      return <BarrasAgrupado d={dado as Agrupado} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
