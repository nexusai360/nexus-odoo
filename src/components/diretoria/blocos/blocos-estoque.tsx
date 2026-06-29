"use client";

// Renders BI dos componentes de Estoque & Compras (A-*/K-*) para o construtor
// modular. Cada função devolve só o CONTEÚDO do bloco (o card/título é do grid).
// Reusa os componentes de qualidade já validados (KpiButton, DonutChart,
// DataTable). Recebe o EstoqueData inteiro e cada bloco usa o pedaço relevante.

import type { ReactNode } from "react";
import {
  Boxes, Package, Layers, Warehouse, Clock, Timer, RefreshCw, Coins,
  ShoppingCart, Wallet, AlertTriangle, CheckCircle2,
} from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { SerieTemporalCompras } from "@/components/diretoria/charts/serie-temporal";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { brl, brlCompacto, num, pct1, DASH } from "@/components/diretoria/kit/format";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";

function KpisEstoque({ d }: { d: EstoqueData }) {
  const i = d.indicadores;
  return (
    <div className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiButton rotulo="Valor em estoque" valor={brlCompacto(i.valorTotal)} valorCompleto={brl.format(i.valorTotal)} icone={Boxes} hint="Soma dos locais" />
      <KpiButton rotulo="Itens" valor={num.format(Math.round(i.itens))} icone={Package} tone="info" hint="Unidades em saldo" />
      <KpiButton rotulo="Produtos" valor={num.format(i.produtos)} icone={Layers} tone="info" hint="Modelos com saldo" />
      <KpiButton rotulo="Locais" valor={num.format(i.locais)} icone={Warehouse} tone="info" hint="Armazéns ativos" />
    </div>
  );
}

function KpisAvancados({ d }: { d: EstoqueData }) {
  const a = d.avancados;
  return (
    <div className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiButton rotulo="Idade média" valor={a.idadeMediaDias != null ? `${num.format(a.idadeMediaDias)} dias` : DASH} icone={Clock} tone="warning" hint="Seriais em estoque" />
      <KpiButton rotulo="Cobertura" valor={a.coberturaDias != null ? `${num.format(a.coberturaDias)} dias` : DASH} icone={Timer} tone="success" hint="Estoque ÷ demanda diária" />
      <KpiButton rotulo="Giro anual" valor={a.giroAnual != null ? `${a.giroAnual}x` : DASH} icone={RefreshCw} hint="Vendido 30d anualizado" />
      <KpiButton rotulo="Valor médio/produto" valor={brlCompacto(a.valorMedioProduto)} valorCompleto={brl.format(a.valorMedioProduto)} icone={Coins} hint="Estoque ÷ produtos" />
    </div>
  );
}

function EstoquePorLocal({ d }: { d: EstoqueData }) {
  const total = d.porLocal.valorGeral || 1;
  const linhas = d.porLocal.linhas.map((l) => ({
    local: l.chave,
    itens: Math.round(l.quantidade),
    valorTotal: l.valorTotal,
    participacao: (l.valorTotal / total) * 100,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "local", header: "Local", tipo: "texto" },
    { key: "itens", header: "Itens", tipo: "numero" },
    { key: "valorTotal", header: "Valor", tipo: "moeda" },
    { key: "participacao", header: "% do total", tipo: "percentual" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="estoque-por-local" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

function DonutFamilia({ d }: { d: EstoqueData }) {
  return <DonutChart data={d.porFamilia.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} maxFatias={8} />;
}
function DonutMarca({ d }: { d: EstoqueData }) {
  return <DonutChart data={d.porMarca.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} maxFatias={8} />;
}
function DonutComprasFornecedor({ d }: { d: EstoqueData }) {
  return <DonutChart data={d.comprasFornecedor.linhas.map((c) => ({ label: c.fornecedor, valor: c.valorTotal }))} maxFatias={8} />;
}
function SerieCompras({ d }: { d: EstoqueData }) {
  return <SerieTemporalCompras serie={d.comprasSerie} />;
}

function Catalogo({ d }: { d: EstoqueData }) {
  const linhas = d.catalogo.linhas.map((m) => ({
    produto: m.produto,
    familia: m.familia ?? "Sem família",
    marca: m.marca ?? "Sem marca",
    quantidade: Math.round(m.quantidade),
    locais: m.locais,
    valorTotal: m.valorTotal,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "produto", header: "Modelo", tipo: "texto" },
    { key: "familia", header: "Família", tipo: "texto" },
    { key: "marca", header: "Marca", tipo: "texto" },
    { key: "quantidade", header: "Qtd", tipo: "numero" },
    { key: "locais", header: "Locais", tipo: "numero" },
    { key: "valorTotal", header: "Valor", tipo: "moeda" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="catalogo-estoque" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

function Seriais({ d }: { d: EstoqueData }) {
  const linhas = d.seriais.linhas.map((s) => ({ serial: s.serial ?? DASH, produto: s.produto ?? DASH }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "serial", header: "Serial", tipo: "texto" },
    { key: "produto", header: "Produto", tipo: "texto" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="seriais" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

/** Rótulo + cor de tag a partir do status de prazo da compra. */
const SITUACAO_PRAZO: Record<string, string> = {
  Atrasada: "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
  Atenção: "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20",
  "No prazo": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
  "Sem previsão": "bg-muted text-muted-foreground",
};
function rotuloSituacao(status: string | null): string {
  if (status === "atrasado") return "Atrasada";
  if (status === "atencao") return "Atenção";
  if (status === "no_prazo") return "No prazo";
  return "Sem previsão";
}

function ComprasAtivas({ d }: { d: EstoqueData }) {
  const c = d.comprasAtivas;
  const linhas = c.linhas.map((l) => ({
    numero: l.numero ?? DASH,
    fornecedor: l.fornecedor ?? DASH,
    etapa: l.etapa ?? DASH,
    situacao: rotuloSituacao(l.statusPrazo),
    prazo: l.statusPrazo === "atrasado" ? `Atrasada ${Math.abs(l.diasRestantes ?? 0)}d` : l.diasRestantes == null ? "Sem previsão" : `Em ${l.diasRestantes}d`,
    valor: l.valor,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Número", tipo: "texto" },
    { key: "fornecedor", header: "Fornecedor", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: SITUACAO_PRAZO },
    { key: "prazo", header: "Prazo", tipo: "texto" },
    { key: "valor", header: "Valor", tipo: "moeda" },
  ];
  const sparkCompras = d.comprasSerie.diaria.slice(-14).map((p) => p.valor);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5">
        <KpiButton rotulo="Ativas" valor={num.format(c.total)} icone={ShoppingCart} tone="info" hint="Não recebidas" />
        <KpiButton rotulo="Em aberto" valor={brlCompacto(c.valorTotal)} valorCompleto={brl.format(c.valorTotal)} icone={Wallet} hint="Soma das ordens" sparkline={sparkCompras} />
        <KpiButton rotulo="Atrasadas" valor={num.format(c.atrasadas)} icone={AlertTriangle} tone={c.atrasadas > 0 ? "danger" : "success"} hint="Prazo vencido" />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="compras-ativas" estado={linhas.length === 0 ? "vazio" : "ok"} />
      </div>
    </div>
  );
}

function MatrizFornecedor({ d }: { d: EstoqueData }) {
  const r = d.resumoCompras;
  const linhas = r.fornecedores.map((f) => ({
    fornecedor: f.fornecedor,
    ativas: f.ativas,
    comprado: f.comprado,
    pago: f.pago,
    aPagar: f.aPagar,
    atrasadas: f.atrasadas,
    situacao: f.atrasadas > 0 ? "Com atraso" : "Em dia",
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "fornecedor", header: "Fornecedor", tipo: "texto" },
    { key: "ativas", header: "Ativas", tipo: "numero" },
    { key: "comprado", header: "Comprado", tipo: "moeda" },
    { key: "pago", header: "Pago", tipo: "moeda" },
    { key: "aPagar", header: "A pagar", tipo: "moeda" },
    { key: "atrasadas", header: "Atrasadas", tipo: "numero" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: {
      "Com atraso": "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      "Em dia": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    } },
  ];
  const pagoPct = r.totalComprado > 0 ? (r.totalPago / r.totalComprado) * 100 : 0;
  const sparkCompras = d.comprasSerie.diaria.slice(-14).map((p) => p.valor);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5">
        <KpiButton rotulo="Comprado" valor={brlCompacto(r.totalComprado)} valorCompleto={brl.format(r.totalComprado)} icone={Coins} hint="Total em ordens" sparkline={sparkCompras} />
        <KpiButton rotulo="Pago" valor={brlCompacto(r.totalPago)} valorCompleto={brl.format(r.totalPago)} icone={CheckCircle2} tone="success" hint={`${pct1(pagoPct)} do total`} />
        <KpiButton rotulo="A pagar" valor={brlCompacto(r.totalAPagar)} valorCompleto={brl.format(r.totalAPagar)} icone={Wallet} tone="warning" hint="Saldo pendente" />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="fornecedores" estado={linhas.length === 0 ? "vazio" : "ok"} />
      </div>
    </div>
  );
}

/** Mapeia o componenteId do catálogo para o render BI, usando o EstoqueData. */
export function renderBlocoEstoque(id: string, d: EstoqueData): ReactNode {
  switch (id) {
    case "A-01": return <KpisEstoque d={d} />;
    case "A-09": return <KpisAvancados d={d} />;
    case "A-02": return <EstoquePorLocal d={d} />;
    case "A-03": return <DonutFamilia d={d} />;
    case "A-04": return <DonutMarca d={d} />;
    case "A-05": return <Catalogo d={d} />;
    case "A-06": return <Seriais d={d} />;
    case "A-07": return <ComprasAtivas d={d} />;
    case "A-08": return <MatrizFornecedor d={d} />;
    case "A-10": return <SerieCompras d={d} />;
    case "K-01": return <DonutComprasFornecedor d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
