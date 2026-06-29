"use client";

// Renders BI dos componentes de Estoque & Compras (A-*/K-*) para o construtor
// modular. Cada função devolve só o CONTEÚDO do bloco (o card/título é do grid).
// Reusa os componentes de qualidade já validados (KpiButton, DonutChart,
// DataTable). Recebe o EstoqueData inteiro e cada bloco usa o pedaço relevante.

import { useState, type ReactNode } from "react";
import {
  Boxes, Package, Layers, Warehouse, Clock, Timer, RefreshCw, Coins,
  ShoppingCart, Wallet, AlertTriangle, CheckCircle2,
} from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { SerieTemporalCompras } from "@/components/diretoria/charts/serie-temporal";
import { DistribuicaoDinamica } from "@/components/diretoria/charts/distribuicao-dinamica";
import { RankingCards } from "@/components/diretoria/charts/ranking-cards";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { InteractiveBarChart } from "@/components/charts/interactive/bar-chart";
import { getColorByIndex } from "@/components/charts/colors";
import type { PeriodKey } from "@/lib/datetime-core";
import { brl, brlCompacto, num, pct1, DASH, nomeLimpo } from "@/components/diretoria/kit/format";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";

/** Painel rico de drill-down: grade de cartões rótulo/valor (ref. Detalhes da
 * chamada do Consumo). Reaproveitado pelas tabelas com `expandDetail`. */
function DetalheGrid({ itens }: { itens: { rotulo: string; valor: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      {itens.map((x) => (
        <div key={x.rotulo} className="rounded-lg border border-border/50 bg-background/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.rotulo}</div>
          <div className="mt-1 text-sm font-semibold tabular-nums">{x.valor}</div>
        </div>
      ))}
    </div>
  );
}

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
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="estoque-por-local" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

/** Agrupa o excedente em "Outros" para não poluir o gráfico (mantém o total). */
function topComOutros(linhas: { chave: string; valorTotal: number }[], max = 7) {
  if (linhas.length <= max) return linhas.map((l) => ({ name: l.chave, value: l.valorTotal }));
  const top = linhas.slice(0, max).map((l) => ({ name: l.chave, value: l.valorTotal }));
  const resto = linhas.slice(max).reduce((s, l) => s + l.valorTotal, 0);
  return [...top, { name: "Outros", value: resto }];
}

// A-03 , Distribuição por família: DONUT clássico com LEGENDA LATERAL (bolinha +
// valor + %) e clique numa fatia para destacar/filtrar. Total no centro, hover
// esmaece as demais. Padrão preferido pelo cliente sobre o donut só-tooltip.
function DonutFamilia({ d }: { d: EstoqueData }) {
  const [sel, setSel] = useState<string | null>(null);
  const data = d.porFamilia.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }));
  return (
    <DonutChart
      data={data}
      formatValor={(v) => brl.format(v)}
      onSelect={(label) => setSel(label || null)}
      selecionado={sel}
    />
  );
}

// A-04 , Distribuição por marca: BARRAS HORIZONTAIS (variedade real, não outro
// donut). Reusa o bar chart interativo.
function BarrasMarca({ d }: { d: EstoqueData }) {
  const data = topComOutros(d.porMarca.linhas, 8).map((s) => ({ name: s.name, valor: s.value }));
  return (
    <InteractiveBarChart
      data={data}
      series={[{ key: "valor", label: "Valor em estoque", color: getColorByIndex(2) }]}
      layout="horizontal"
      height={240}
      yAxisWidth={120}
      showLegend={false}
      formatValue={(v) => brlCompacto(v)}
      ariaLabel="Valor de estoque por marca (barras horizontais)"
    />
  );
}

// K-01 , Compras por fornecedor (NF entrada): LISTA DE CARDS RANQUEADA. Razões
// sociais longas não cabem em barras; o ranking de cards mostra posição + nome +
// valor + proporção, com ordenação (pedido do cliente). `nomeLimpo` remove o CNPJ.
function RankingComprasFornecedor({ d }: { d: EstoqueData }) {
  const itens = d.comprasFornecedor.linhas.map((c) => ({
    nome: nomeLimpo(c.fornecedor),
    valor: c.valorTotal,
    sub: `${num.format(c.notas)} ${c.notas === 1 ? "nota" : "notas"}`,
  }));
  return <RankingCards itens={itens} max={15} rotuloValor="compras" />;
}

// A-11 , Distribuição dinâmica: o usuário troca a dimensão (família/marca/local)
// e o gráfico muda (donut <-> barras). É o "gráfico dinâmico" pedido.
function Distribuicao({ d }: { d: EstoqueData }) {
  return (
    <DistribuicaoDinamica
      dimensoes={[
        { chave: "familia", rotulo: "Família", linhas: d.porFamilia.linhas },
        { chave: "marca", rotulo: "Marca", linhas: d.porMarca.linhas },
        { chave: "local", rotulo: "Local", linhas: d.porLocal.linhas },
      ]}
    />
  );
}


function Catalogo({ d }: { d: EstoqueData }) {
  const total = d.catalogo.valorGeral || 1;
  const linhas = d.catalogo.linhas.map((m) => ({
    produto: m.produto,
    classificacao: [m.familia ?? "Sem família", m.marca ?? "Sem marca"],
    quantidade: Math.round(m.quantidade),
    locais: m.locais,
    valorTotal: m.valorTotal,
    _participacao: (m.valorTotal / total) * 100,
    _valorMedio: m.quantidade > 0 ? m.valorTotal / m.quantidade : 0,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "produto", header: "Modelo", tipo: "texto" },
    { key: "classificacao", header: "Família / Marca", tipo: "tags", tagCores: {} },
    { key: "quantidade", header: "Qtd", tipo: "numero" },
    { key: "locais", header: "Locais", tipo: "numero" },
    { key: "valorTotal", header: "Valor", tipo: "moeda" },
  ];
  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      searchable
      compactoInicial
      alturaFluida
      exportFilename="catalogo-estoque"
      estado={linhas.length === 0 ? "vazio" : "ok"}
      expandDetail={(row) => (
        <DetalheGrid
          itens={[
            { rotulo: "Valor total", valor: brl.format(row.valorTotal) },
            { rotulo: "Valor médio/un.", valor: brl.format(row._valorMedio) },
            { rotulo: "% do estoque", valor: pct1(row._participacao) },
            { rotulo: "Presença", valor: `${row.locais} ${row.locais === 1 ? "local" : "locais"}` },
          ]}
        />
      )}
    />
  );
}

function Seriais({ d }: { d: EstoqueData }) {
  const linhas = d.seriais.linhas.map((s) => ({ serial: s.serial ?? DASH, produto: s.produto ?? DASH }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "serial", header: "Serial", tipo: "texto" },
    { key: "produto", header: "Produto", tipo: "texto" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="seriais" estado={linhas.length === 0 ? "vazio" : "ok"} />;
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
    _comprador: l.comprador ?? DASH,
    _dataOrcamento: l.dataOrcamento ?? DASH,
    _dataPrevista: l.dataPrevista ?? DASH,
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
        <DataTable
          columns={colunas}
          rows={linhas}
          searchable
          compactoInicial
          alturaFluida
          exportFilename="compras-ativas"
          estado={linhas.length === 0 ? "vazio" : "ok"}
          expandDetail={(row) => (
            <DetalheGrid
              itens={[
                { rotulo: "Fornecedor", valor: row.fornecedor },
                { rotulo: "Comprador", valor: row._comprador },
                { rotulo: "Etapa", valor: row.etapa },
                { rotulo: "Situação", valor: row.situacao },
                { rotulo: "Data do orçamento", valor: row._dataOrcamento },
                { rotulo: "Previsão de entrega", valor: row._dataPrevista },
                { rotulo: "Prazo", valor: row.prazo },
                { rotulo: "Valor da ordem", valor: brl.format(row.valor) },
              ]}
            />
          )}
        />
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
        <DataTable
          columns={colunas}
          rows={linhas}
          searchable
          compactoInicial
          alturaFluida
          exportFilename="fornecedores"
          estado={linhas.length === 0 ? "vazio" : "ok"}
          expandDetail={(row) => {
            const pago = row.comprado > 0 ? (row.pago / row.comprado) * 100 : 0;
            return (
              <DetalheGrid
                itens={[
                  { rotulo: "Fornecedor", valor: row.fornecedor },
                  { rotulo: "Ordens ativas", valor: num.format(row.ativas) },
                  { rotulo: "Comprado", valor: brl.format(row.comprado) },
                  { rotulo: "Pago", valor: brl.format(row.pago) },
                  { rotulo: "A pagar", valor: brl.format(row.aPagar) },
                  { rotulo: "% pago", valor: pct1(pago) },
                  { rotulo: "Atrasadas", valor: num.format(row.atrasadas) },
                  { rotulo: "Situação", valor: row.situacao },
                ]}
              />
            );
          }}
        />
      </div>
    </div>
  );
}

/** Mapeia o componenteId do catálogo para o render BI, usando o EstoqueData.
 * `periodo`/`customRange` (pílula global) comandam os blocos temporais (A-10). */
export function renderBlocoEstoque(
  id: string,
  d: EstoqueData,
  periodo: PeriodKey = "semana_atual",
  customRange?: { start: string; end: string },
): ReactNode {
  switch (id) {
    case "A-01": return <KpisEstoque d={d} />;
    case "A-09": return <KpisAvancados d={d} />;
    case "A-02": return <EstoquePorLocal d={d} />;
    case "A-03": return <DonutFamilia d={d} />;
    case "A-04": return <BarrasMarca d={d} />;
    case "A-11": return <Distribuicao d={d} />;
    case "A-05": return <Catalogo d={d} />;
    case "A-06": return <Seriais d={d} />;
    case "A-07": return <ComprasAtivas d={d} />;
    case "A-08": return <MatrizFornecedor d={d} />;
    case "A-10": return <SerieTemporalCompras serie={d.comprasSerie} periodo={periodo} customRange={customRange} />;
    case "K-01": return <RankingComprasFornecedor d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
