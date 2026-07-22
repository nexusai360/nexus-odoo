"use client";

// Renders BI dos componentes de Pedidos & Entregas (B-*) para o construtor
// modular. Reusa os componentes ricos (KPIs, mapa do Brasil, ranking de cards,
// tabela rica com tags de prazo).

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  PackageCheck, Wallet, AlertTriangle, HandCoins,
  ClipboardList, Receipt, Coins, Info, History,
} from "lucide-react";

import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { RankingCards } from "@/components/diretoria/charts/ranking-cards";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import { BrazilMap } from "@/components/diretoria/brazil-map/brazil-map";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { TabelaAvancada, type PresetFiltro } from "@/components/tabela-avancada/tabela-avancada";
import {
  COLUNAS as COLUNAS_ENTREGA,
  COLUNA_BY_KEY as COLUNA_ENTREGA_BY_KEY,
  CAMPOS as CAMPOS_ENTREGA,
  CAMPO_BY_KEY as CAMPO_ENTREGA_BY_KEY,
  AGRUPAMENTOS as AGRUPAMENTOS_ENTREGA,
  celula as celulaEntrega,
  formatBRL as formatBRLEntrega,
  // dropdownProdutos,  // STAND-BY (pedido do dono): dropdown de produtos na lista
  //                    // desativado, pois o detalhe do pedido já mostra os produtos.
  DetalheEntrega,
  type LinhaEntrega,
  type ItemEntrega,
} from "@/components/tabela-avancada/entregas-catalogo";
import { cn } from "@/lib/utils";
import { brl, brlCompacto, num, DASH, rotuloUf, ufValida, nomeLimpo } from "@/components/diretoria/kit/format";
import type { PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";

// B-01 , Indicadores de demandas (KPIs).
function KpisDemandas({ d }: { d: PedidosData }) {
  const i = d.indicadores;
  return (
    <div className="grid h-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiButton rotulo="Pendentes" valor={num.format(i.totalPendentes)} icone={PackageCheck} tone="info" hint="A entregar" />
      <KpiButton rotulo="A entregar" valor={brlCompacto(i.valorAEntregar)} valorCompleto={brl.format(i.valorAEntregar)} icone={Wallet} hint="Valor em aberto" />
      <KpiButton rotulo="Atrasadas" valor={num.format(i.atrasadas)} icone={AlertTriangle} tone={i.atrasadas > 0 ? "danger" : "success"} hint="Prazo vencido" />
      <KpiButton rotulo="A receber" valor={brlCompacto(d.aReceber)} valorCompleto={brl.format(d.aReceber)} icone={HandCoins} tone="success" hint="Pedidos faturados" />
    </div>
  );
}

// B-02 / B-03 , Mapa de demandas por estado.
function MapaDemandas({ d }: { d: PedidosData }) {
  const data = d.porUf.linhas.filter((l) => ufValida(l.uf)).map((l) => ({ uf: l.uf, valor: l.valorTotal }));
  return <BrazilMap data={data} metric="Demandas a entregar" formatValor={(v) => brl.format(v)} />;
}

// B-05 , Ranking de estados por demanda: LISTA DE CARDS.
function RankingDemandasUf({ d }: { d: PedidosData }) {
  const itens = d.porUf.linhas.map((l) => ({ nome: rotuloUf(l.uf), valor: l.valorTotal, sub: `${num.format(l.quantidade)} ${l.quantidade === 1 ? "demanda" : "demandas"}` }));
  return <RankingCards itens={itens} max={15} rotuloValor="valor a entregar" />;
}

// B-04 , Pendentes: TABELA RICA com tag de prazo.
function Pendentes({ d }: { d: PedidosData }) {
  const linhas = d.pendentes.linhas.map((l) => ({
    numero: l.numero ?? DASH,
    cliente: nomeLimpo(l.cliente) || DASH,
    uf: rotuloUf(l.uf),
    etapa: l.etapa ?? DASH,
    situacao: l.atrasado ? "Atrasado" : "No prazo",
    previsao: l.dataPrevista ?? "Sem previsão",
    valor: l.valor,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Número", tipo: "texto" },
    { key: "cliente", header: "Cliente", tipo: "texto" },
    { key: "uf", header: "UF", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: {
      Atrasado: "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      "No prazo": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    } },
    { key: "previsao", header: "Previsão", tipo: "data" },
    { key: "valor", header: "Valor", tipo: "moeda" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="pedidos-pendentes" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

// B-06 , Demanda por etapa: rosca do valor em aberto por etapa do pedido.
function DemandaPorEtapa({ d }: { d: PedidosData }) {
  const data = d.porEtapa.map((e) => ({ label: e.etapaNome ?? "Sem etapa", valor: e.valorTotal }));
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem demanda em aberto.</p>;
  }
  return <DonutChart data={data} maxFatias={8} />;
}

// B-07 , Demandas mais paradas: tabela com dias parado e selo de criticidade.
// A cor é reforçada pelo texto do selo (não depende só de cor , WCAG).
function selo(dias: number | null): "Crítico" | "Atenção" | "Recente" {
  if (dias != null && dias >= 30) return "Crítico";
  if (dias != null && dias >= 14) return "Atenção";
  return "Recente";
}
function MaisParadas({ d }: { d: PedidosData }) {
  const linhas = d.maisParadas.map((l) => ({
    numero: l.numero ?? DASH,
    cliente: nomeLimpo(l.cliente) || DASH,
    uf: rotuloUf(l.uf),
    etapa: l.etapa ?? DASH,
    diasParado: l.diasParado ?? 0,
    situacao: selo(l.diasParado),
    valor: l.valor,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "numero", header: "Número", tipo: "texto" },
    { key: "cliente", header: "Cliente", tipo: "texto" },
    { key: "uf", header: "UF", tipo: "texto" },
    { key: "etapa", header: "Etapa", tipo: "texto" },
    { key: "diasParado", header: "Dias parado", tipo: "numero" },
    { key: "situacao", header: "Situação", tipo: "tag", tagCores: {
      "Crítico": "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      "Atenção": "bg-amber-500/10 text-amber-500 ring-1 ring-inset ring-amber-500/20",
      "Recente": "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    } },
    { key: "valor", header: "Valor", tipo: "moeda" },
  ];
  return <DataTable columns={colunas} rows={linhas} searchable compactoInicial alturaFluida exportFilename="demandas-mais-paradas" estado={linhas.length === 0 ? "vazio" : "ok"} />;
}

// B-08 , Entregas parciais: os 3 valores + o corte, no topo do relatório.
// Alterna a inclusão dos pedidos anteriores à data de análise via URL (server refetch).
function ToggleCorteEntregas() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const incluiAntigos = sp.get("entregas_todos") === "1";
  const alternar = () => {
    const p = new URLSearchParams(sp.toString());
    if (incluiAntigos) p.delete("entregas_todos");
    else p.set("entregas_todos", "1");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={incluiAntigos}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        incluiAntigos
          ? "border-violet-500/60 bg-violet-600/15 text-violet-700 dark:text-violet-200"
          : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      <History className="h-3.5 w-3.5" aria-hidden />
      {incluiAntigos ? "Incluindo pedidos anteriores à data de análise" : "Incluir pedidos anteriores à data de análise"}
    </button>
  );
}

function KpisEntregasParciais({ d }: { d: PedidosData }) {
  const i = d.entregasParciais.indicadores;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pedidos com saldo a entregar. Os três valores respondem a estranheza dos totais.
        </p>
        <ToggleCorteEntregas />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiButton rotulo="Pedidos" valor={num.format(i.qtdPedidos)} icone={ClipboardList} tone="info" hint="Em aberto no período" />
        <KpiButton rotulo="Total dos pedidos" valor={brlCompacto(i.totalPedido)} valorCompleto={brl.format(i.totalPedido)} icone={Receipt} hint="Valor cheio, a venda (inclui o já entregue)" />
        <KpiButton rotulo="Falta entregar (venda)" valor={brlCompacto(i.aAtenderVenda)} valorCompleto={brl.format(i.aAtenderVenda)} icone={Wallet} hint="Saldo a atender, a preço de venda" />
        <KpiButton rotulo="Falta entregar (custo)" valor={brlCompacto(i.aAtenderCusto)} valorCompleto={brl.format(i.aAtenderCusto)} icone={Coins} tone="success" hint="Saldo a atender, a custo (mesma métrica do card: bate para o mesmo período e empresa)" />
      </div>
      {!d.entregasParciais.atendimentoSincronizado ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          A sincronização de atendimento está pendente: os valores usam a quantidade cheia do pedido.
        </p>
      ) : null}
    </div>
  );
}

// B-09 , Entregas parciais: a tabela operacional detalhada por item.
// Vendedor do Odoo vem como "Nome Completo - login"; exibimos só o nome.
function nomeVendedor(raw: string | null): string {
  if (!raw) return DASH;
  const nome = raw.split(" - ")[0].trim();
  return nome || raw.trim() || DASH;
}
const PRESETS_ENTREGA: PresetFiltro[] = [
  { id: "fin-bloq", label: "Financeiro bloqueado", campo: "status", valor: "Bloqueado" },
];

function TabelaEntregasParciais({ d }: { d: PedidosData }) {
  // Agrupa as linhas de item (uma por produto) em PEDIDOS: cada pedido vira uma
  // linha com cabeçalho + agregados + itens aninhados (dropdown/detalhe).
  const mapa = new Map<string, LinhaEntrega>();
  for (const l of d.entregasParciais.linhas) {
    const key = String(l.pedidoId || l.numero || DASH);
    const item: ItemEntrega = {
      codigo: l.codigoProduto ?? DASH,
      produto: l.produto ?? DASH,
      familia: l.familia ?? DASH,
      marca: l.marca ?? DASH,
      qtdTotal: l.quantidadeTotal,
      qtdAtendida: l.quantidadeAtendida,
      qtd: l.qtdAAtender,
      unitario: l.unitario,
      valorCheio: l.valorCheio,
      valorCustoTotal: l.valorCustoTotal,
      vlrVenda: l.valorVendaAAtender,
      vlrCusto: l.valorCustoAAtender,
      // Rentabilidade do item (prontos do Odoo, por produto).
      comissaoPct: l.itemComissaoPct,
      comissaoValor: l.itemComissaoValor,
      liquido: l.itemLiquido,
      margemPct: l.itemMargemPct,
      descontoValor: l.itemDescontoValor,
      descontoPct: l.itemDescontoPct,
    };
    let ped = mapa.get(key);
    if (!ped) {
      ped = {
        pedidoId: l.pedidoId ?? 0,
        numero: l.numero ?? DASH,
        mercos: l.numeroMercos ?? DASH,
        // datas (ISO ou DASH; a coluna tipo "data" formata DD/MM/AAAA).
        orcamento: l.orcamento ?? DASH,
        prevista: l.prevista ?? DASH,
        contrato: l.validade ?? DASH,
        // Nome completo (limpa o CNPJ embutido, sem cortar): o detalhe mostra
        // inteiro; a lista trunca por CSS quando falta largura.
        emitente: nomeLimpo(l.emitente, 999) || DASH,
        cliente: nomeLimpo(l.cliente, 999) || DASH,
        cnpj: l.cnpj ?? DASH,
        cep: l.cep ?? DASH,
        uf: l.uf === "??" ? DASH : rotuloUf(l.uf),
        cidade: l.cidade ?? DASH,
        operacao: l.operacao ?? DASH,
        modalidade: l.modalidade ?? DASH,
        etapa: l.etapa ?? DASH,
        etapaCor: l.etapaCor,
        status: l.statusFinanceiro === "bloqueado" ? "Bloqueado" : "Liberado",
        // Mostra a forma como vem da base (ex.: "Sem pagamento", "Boleto"); só
        // cai no traço quando de fato não há valor. (Fonte em revisão: alguns
        // pedidos vêm sem parcela e a forma real está no cabeçalho do pedido.)
        forma: l.formaPagamento ?? DASH,
        condicao: l.condicaoPagamento ?? DASH,
        vendedor: nomeVendedor(l.vendedor),
        observacoes: l.observacoes ?? DASH,
        obsEntrega: l.obsEntrega ?? DASH,
        qtdItens: 0,
        qtdTotal: 0,
        qtdAtendida: 0,
        qtd: 0,
        valorCheio: 0,
        valorTotalCusto: 0,
        valorAtendidoVenda: 0,
        valorAtendidoCusto: 0,
        vlrVenda: 0,
        vlrCusto: 0,
        // Rentabilidade (nível pedido, igual em toda linha; vem do cabeçalho).
        subtotal: l.subtotal,
        valorProduto: l.valorProduto,
        custoComercial: l.custoComercial,
        icms: l.icms,
        difal: l.difal,
        fcp: l.fcp,
        pis: l.pis,
        cofins: l.cofins,
        irpj: l.irpj,
        csll: l.csll,
        cbs: l.cbs,
        ibs: l.ibs,
        comissaoPct: l.comissaoPct,
        comissaoValor: l.comissaoValor,
        liquido: l.liquido,
        margemPct: l.margemPct,
        descontoValor: l.descontoValor,
        descontoPct: l.descontoPct,
        itens: [],
        produtosTexto: "",
        familias: [],
        marcas: [],
      };
      mapa.set(key, ped);
    }
    ped.itens.push(item);
  }
  const linhas: LinhaEntrega[] = [];
  for (const ped of mapa.values()) {
    ped.qtdItens = ped.itens.length;
    ped.qtdTotal = ped.itens.reduce((s, i) => s + (i.qtdTotal || 0), 0);
    ped.qtdAtendida = ped.itens.reduce((s, i) => s + (i.qtdAtendida || 0), 0);
    ped.qtd = ped.itens.reduce((s, i) => s + (i.qtd || 0), 0);
    ped.valorCheio = ped.itens.reduce((s, i) => s + (i.valorCheio || 0), 0);
    ped.valorTotalCusto = ped.itens.reduce((s, i) => s + (i.valorCustoTotal || 0), 0);
    ped.vlrVenda = ped.itens.reduce((s, i) => s + (i.vlrVenda || 0), 0);
    ped.vlrCusto = ped.itens.reduce((s, i) => s + (i.vlrCusto || 0), 0);
    ped.valorAtendidoVenda = Math.max(0, ped.valorCheio - ped.vlrVenda);
    ped.valorAtendidoCusto = Math.max(0, ped.valorTotalCusto - ped.vlrCusto);
    ped.produtosTexto = ped.itens.map((i) => `${i.codigo} ${i.produto}`).join(" | ");
    ped.familias = [...new Set(ped.itens.map((i) => i.familia).filter((v) => v && v !== DASH))];
    ped.marcas = [...new Set(ped.itens.map((i) => i.marca).filter((v) => v && v !== DASH))];
    linhas.push(ped);
  }
  // Pedidos maiores (maior saldo a atender, a venda) primeiro.
  linhas.sort((a, b) => b.vlrVenda - a.vlrVenda);
  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        Nenhuma entrega parcial para o período/empresa selecionados.
      </div>
    );
  }
  return (
    <TabelaAvancada<LinhaEntrega>
      base={linhas}
      colunas={COLUNAS_ENTREGA}
      colunaByKey={COLUNA_ENTREGA_BY_KEY}
      campos={CAMPOS_ENTREGA}
      campoByKey={CAMPO_ENTREGA_BY_KEY}
      agrupamentos={AGRUPAMENTOS_ENTREGA}
      celula={celulaEntrega}
      rowKey={(l) => String(l.pedidoId || l.numero)}
      valorSoma={(l) => l.vlrCusto}
      colunaSoma="valorAtender"
      storageKey="entregas-parciais-tabela-v6"
      exportFilename="entregas-parciais"
      labelRegistro="pedidos"
      presets={PRESETS_ENTREGA}
      kanbanCampo="etapa"
      calendarioCampo="prevista"
      tituloItem={(l) => l.numero}
      subtituloItem={(l) => l.cliente}
      valorItem={(l) => formatBRLEntrega(l.vlrVenda)}
      /* STAND-BY (pedido do dono): dropdown de produtos na lista comentado porque
         o detalhe do pedido ja mostra os produtos; ficou redundante. Para reativar,
         descomente o import de dropdownProdutos e a prop abaixo. */
      /* expandirRow={dropdownProdutos} */
      renderDetalhe={(l) => <DetalheEntrega l={l} />}
      textoBusca={(l) => l.produtosTexto}
      permiteVenda
    />
  );
}

/** Mapeia o componenteId do catálogo para o render BI de Pedidos. */
export function renderBlocoPedidos(id: string, d: PedidosData): ReactNode {
  switch (id) {
    case "B-01": return <KpisDemandas d={d} />;
    case "B-02": return <MapaDemandas d={d} />;
    case "B-03": return <MapaDemandas d={d} />;
    case "B-04": return <Pendentes d={d} />;
    case "B-05": return <RankingDemandasUf d={d} />;
    case "B-06": return <DemandaPorEtapa d={d} />;
    case "B-07": return <MaisParadas d={d} />;
    case "B-08": return <KpisEntregasParciais d={d} />;
    case "B-09": return <TabelaEntregasParciais d={d} />;
    default:
      return <p className="py-6 text-center text-sm text-muted-foreground">Componente em breve.</p>;
  }
}
