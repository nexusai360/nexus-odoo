"use client";

// Tela "Estoque & Compras" da Diretoria , reconstrução BI data-dense por ABAS.
// Setorização: Visão geral / Estoque / Distribuição / Seriais / Compras /
// Fornecedores. KPIs-botão filtram, donuts clicáveis filtram o catálogo, tabelas
// com busca/sort, chips de filtro, contagem regressiva colorida. Todo o dado vem
// pronto do server (page.tsx); aqui só interatividade. ui-ux-pro-max: estilo
// Data-Dense Dashboard (dark+violeta), hover 150ms, foco acessível, "-" em vazio.

import { useMemo, useState } from "react";
import {
  Boxes, Package, Layers, Warehouse, Clock, Timer, RefreshCw, Coins,
  ShoppingCart, Wallet, AlertTriangle, CheckCircle2, Truck, Tag, Barcode,
  Building2, CircleDollarSign, TrendingUp,
} from "lucide-react";

import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { KpiButton } from "@/components/diretoria/kit/kpi-button";
import { SectionCard } from "@/components/diretoria/kit/section-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { DonutChart } from "@/components/diretoria/charts/donut-chart";
import type {
  IndicadoresEstoque, LinhaAgrupada, CatalogoModelo, CatalogoEstoque,
  SerialLinha, CompraFornecedor, CompraAtivaLinha, ComprasAtivas,
  ResumoCompras, FornecedorResumo, IndicadoresAvancados,
} from "@/lib/diretoria/queries/estoque";
import type { StatusPrazo } from "@/lib/diretoria/cores";

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR");
const pct1 = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Moeda compacta para KPIs estreitos (R$ 1,2 mi / R$ 340 mil). */
function brlCompacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  return brl.format(v);
}
const DASH = "-";

// ---------------------------------------------------------------------------
// Props (dado vindo do server)
// ---------------------------------------------------------------------------
export interface EstoqueData {
  indicadores: IndicadoresEstoque;
  avancados: IndicadoresAvancados;
  porLocal: { linhas: LinhaAgrupada[]; valorGeral: number };
  porFamilia: { linhas: LinhaAgrupada[]; valorGeral: number };
  porMarca: { linhas: LinhaAgrupada[]; valorGeral: number };
  catalogo: CatalogoEstoque;
  seriais: { linhas: SerialLinha[]; total: number };
  comprasFornecedor: { linhas: CompraFornecedor[]; valorGeral: number };
  comprasAtivas: ComprasAtivas;
  resumoCompras: ResumoCompras;
}

// ---------------------------------------------------------------------------
// Blocos auxiliares
// ---------------------------------------------------------------------------

/** Pílula de prazo (cor + texto, nunca só cor). */
function PrazoBadge({ status, dias }: { status: StatusPrazo | null; dias: number | null }) {
  if (status === null || dias === null) {
    return <span className="text-xs text-muted-foreground">Sem previsão</span>;
  }
  const estilo: Record<StatusPrazo, string> = {
    no_prazo: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    atencao: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    atrasado: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
  };
  const rotulo = status === "atrasado" ? `Atrasada ${Math.abs(dias)}d` : dias === 0 ? "Vence hoje" : `Em ${dias}d`;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset", estilo[status])}>
      {rotulo}
    </span>
  );
}

/** Chips de filtro horizontais (toggle). */
function ChipsFiltro<T extends string>({
  opcoes, valor, onChange,
}: {
  opcoes: { id: T; label: string; count?: number }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={ativo}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo
                ? "border-violet-500/60 bg-violet-600/15 text-violet-200"
                : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null ? (
              <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", ativo ? "bg-violet-500/30" : "bg-muted")}>
                {num.format(o.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de participação inline (para "estoque por local"). */
function BarraParticipacao({ frac }: { frac: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-[width] duration-300"
        style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
const ABAS = [
  { id: "visao", label: "Visão geral", icon: TrendingUp },
  { id: "estoque", label: "Estoque", icon: Boxes },
  { id: "distribuicao", label: "Distribuição", icon: Layers },
  { id: "seriais", label: "Seriais", icon: Barcode },
  { id: "compras", label: "Compras", icon: ShoppingCart },
  { id: "fornecedores", label: "Fornecedores", icon: Building2 },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

export function EstoqueScreen({ data }: { data: EstoqueData }) {
  const [aba, setAba] = useState<AbaId>("visao");
  const [familiaSel, setFamiliaSel] = useState<string>("");
  const [marcaSel, setMarcaSel] = useState<string>("");

  // Donut clicado → filtra catálogo e leva para a aba Estoque.
  function filtrarPorFamilia(label: string) {
    setFamiliaSel(label);
    setMarcaSel("");
    setAba("estoque");
  }
  function filtrarPorMarca(label: string) {
    setMarcaSel(label);
    setFamiliaSel("");
    setAba("estoque");
  }

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)} className="gap-5">
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
        {ABAS.map((a) => (
          <TabsTrigger key={a.id} value={a.id} className="flex-none gap-1.5 px-3 py-1.5">
            <a.icon className="h-3.5 w-3.5" aria-hidden />
            {a.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="visao">
        <AbaVisao data={data} onFamilia={filtrarPorFamilia} onMarca={filtrarPorMarca} />
      </TabsContent>
      <TabsContent value="estoque">
        <AbaEstoque
          data={data}
          familiaSel={familiaSel} setFamiliaSel={setFamiliaSel}
          marcaSel={marcaSel} setMarcaSel={setMarcaSel}
        />
      </TabsContent>
      <TabsContent value="distribuicao">
        <AbaDistribuicao data={data} onFamilia={filtrarPorFamilia} onMarca={filtrarPorMarca} familiaSel={familiaSel} marcaSel={marcaSel} />
      </TabsContent>
      <TabsContent value="seriais">
        <AbaSeriais data={data} />
      </TabsContent>
      <TabsContent value="compras">
        <AbaCompras data={data} />
      </TabsContent>
      <TabsContent value="fornecedores">
        <AbaFornecedores data={data} />
      </TabsContent>
    </Tabs>
  );
}

// ===========================================================================
// ABA: VISÃO GERAL
// ===========================================================================
function AbaVisao({
  data, onFamilia, onMarca,
}: { data: EstoqueData; onFamilia: (l: string) => void; onMarca: (l: string) => void }) {
  const { indicadores, avancados, resumoCompras } = data;
  return (
    <div className="flex flex-col gap-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Valor em estoque" valor={brl.format(indicadores.valorTotal)} icone={Boxes} hint="Soma de todos os locais" />
        <KpiButton rotulo="Itens em estoque" valor={num.format(Math.round(indicadores.itens))} icone={Package} tone="info" hint="Unidades em saldo" />
        <KpiButton rotulo="Produtos distintos" valor={num.format(indicadores.produtos)} icone={Layers} tone="info" hint="Modelos com saldo" />
        <KpiButton rotulo="Locais" valor={num.format(indicadores.locais)} icone={Warehouse} tone="info" hint="Armazéns ativos" />
      </div>

      {/* Indicadores avançados */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Idade média" valor={avancados.idadeMediaDias != null ? `${num.format(avancados.idadeMediaDias)} dias` : DASH} icone={Clock} tone="warning" hint="Seriais em estoque" />
        <KpiButton rotulo="Cobertura" valor={avancados.coberturaDias != null ? `${num.format(avancados.coberturaDias)} dias` : DASH} icone={Timer} tone="success" hint="Estoque ÷ demanda diária (30d)" />
        <KpiButton rotulo="Giro anual" valor={avancados.giroAnual != null ? `${avancados.giroAnual}x` : DASH} icone={RefreshCw} hint="Vendido 30d anualizado ÷ estoque" />
        <KpiButton rotulo="Valor médio/produto" valor={brl.format(avancados.valorMedioProduto)} icone={Coins} hint="Valor de estoque ÷ produtos" />
      </div>

      {/* Distribuição rápida */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Distribuição por família" subtitle="Clique numa fatia para filtrar o catálogo" icon={Layers}>
          <DonutChart data={data.porFamilia.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} onSelect={onFamilia} maxFatias={8} />
        </SectionCard>
        <SectionCard title="Distribuição por marca" subtitle="Clique numa fatia para filtrar o catálogo" icon={Tag}>
          <DonutChart data={data.porMarca.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} onSelect={onMarca} maxFatias={8} />
        </SectionCard>
      </div>

      {/* Resumo de compras */}
      <SectionCard title="Compras" subtitle="Ordens de compra (situação atual)" icon={ShoppingCart} bodyClassName="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Comprado" valor={brl.format(resumoCompras.totalComprado)} icone={CircleDollarSign} hint="Total em ordens" />
        <KpiButton rotulo="A pagar" valor={brl.format(resumoCompras.totalAPagar)} icone={Wallet} tone="warning" hint="Saldo a pagar" />
        <KpiButton rotulo="Ativas" valor={num.format(resumoCompras.comprasAtivas)} icone={Truck} tone="info" hint="Não recebidas" />
        <KpiButton rotulo="Atrasadas" valor={num.format(resumoCompras.atrasadas)} icone={AlertTriangle} tone={resumoCompras.atrasadas > 0 ? "danger" : "success"} hint="Prazo vencido" />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// ABA: ESTOQUE (A2 por local + A3 catálogo)
// ===========================================================================
function AbaEstoque({
  data, familiaSel, setFamiliaSel, marcaSel, setMarcaSel,
}: {
  data: EstoqueData;
  familiaSel: string; setFamiliaSel: (v: string) => void;
  marcaSel: string; setMarcaSel: (v: string) => void;
}) {
  const { porLocal, catalogo, indicadores } = data;
  const totalLocal = porLocal.valorGeral || 1;
  const topLocais = porLocal.linhas.slice(0, 4);

  // Linhas para a tabela de "todos os locais".
  const linhasLocal = useMemo(
    () =>
      porLocal.linhas.map((l) => ({
        local: l.chave,
        itens: Math.round(l.quantidade),
        valorTotal: l.valorTotal,
        participacao: (l.valorTotal / totalLocal) * 100,
      })),
    [porLocal.linhas, totalLocal],
  );
  const colunasLocal: ColumnDef<(typeof linhasLocal)[number]>[] = [
    { key: "local", header: "Local", tipo: "texto" },
    { key: "itens", header: "Itens", tipo: "numero" },
    { key: "valorTotal", header: "Valor", tipo: "moeda" },
    { key: "participacao", header: "% do total", tipo: "percentual" },
  ];

  // Famílias para chips (top 8 por valor) + opção "Todas".
  const familias = useMemo(() => {
    const arr = data.porFamilia.linhas.slice(0, 8).map((l) => l.chave);
    return arr;
  }, [data.porFamilia.linhas]);

  // Catálogo filtrado por família/marca (busca/sort ficam no DataTable).
  const linhasCatalogo = useMemo(() => {
    return catalogo.linhas
      .filter((m) => (familiaSel ? (m.familia ?? "Sem família") === familiaSel : true))
      .filter((m) => (marcaSel ? (m.marca ?? "Sem marca") === marcaSel : true))
      .map((m: CatalogoModelo) => ({
        produto: m.produto,
        familia: m.familia ?? "Sem família",
        marca: m.marca ?? "Sem marca",
        quantidade: Math.round(m.quantidade),
        locais: m.locais,
        valorTotal: m.valorTotal,
      }));
  }, [catalogo.linhas, familiaSel, marcaSel]);

  const colunas: ColumnDef<(typeof linhasCatalogo)[number]>[] = [
    { key: "produto", header: "Modelo", tipo: "texto" },
    { key: "familia", header: "Família", tipo: "texto" },
    { key: "marca", header: "Marca", tipo: "texto" },
    { key: "quantidade", header: "Qtd", tipo: "numero" },
    { key: "locais", header: "Locais", tipo: "numero" },
    { key: "valorTotal", header: "Valor", tipo: "moeda" },
  ];

  const filtroAtivo = familiaSel || marcaSel;

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Valor em estoque" valor={brl.format(indicadores.valorTotal)} icone={Boxes} hint="Soma de todos os locais" />
        <KpiButton rotulo="Itens em estoque" valor={num.format(Math.round(indicadores.itens))} icone={Package} tone="info" hint="Unidades em saldo" />
        <KpiButton rotulo="Produtos distintos" valor={num.format(indicadores.produtos)} icone={Layers} tone="info" hint="Modelos com saldo" />
        <KpiButton rotulo="Locais" valor={num.format(indicadores.locais)} icone={Warehouse} tone="info" hint="Armazéns ativos" />
      </div>

      {/* Estoque por local: destaque top 4 + tabela completa */}
      <SectionCard title="Estoque por local" subtitle={`${porLocal.linhas.length} locais · ${brl.format(porLocal.valorGeral)} no total`} icon={Warehouse}>
        {porLocal.linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {topLocais.map((l) => {
                const frac = l.valorTotal / totalLocal;
                return (
                  <div key={l.chave} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium" title={l.chave}>{l.chave}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct1(frac * 100)}</span>
                    </div>
                    <div className="mt-1.5 text-lg font-semibold tabular-nums">{brl.format(l.valorTotal)}</div>
                    <div className="mt-2"><BarraParticipacao frac={frac} /></div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">{num.format(Math.round(l.quantidade))} itens</div>
                  </div>
                );
              })}
            </div>
            <DataTable columns={colunasLocal} rows={linhasLocal} searchable compactoInicial exportFilename="estoque-por-local" />
          </>
        )}
      </SectionCard>

      {/* Catálogo (A3) */}
      <SectionCard
        title="Modelos do catálogo em estoque"
        subtitle={`${num.format(linhasCatalogo.length)} de ${num.format(catalogo.total)} modelos${filtroAtivo ? " (filtrado)" : ""}`}
        icon={Package}
        action={
          <ChipsFiltro
            opcoes={[{ id: "", label: "Todas as famílias" }, ...familias.map((f) => ({ id: f, label: f }))]}
            valor={familiaSel}
            onChange={(v) => { setFamiliaSel(v); }}
          />
        }
      >
        {(familiaSel || marcaSel) ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Filtros ativos:</span>
            {familiaSel ? (
              <button type="button" onClick={() => setFamiliaSel("")} className="inline-flex items-center gap-1 rounded-full bg-violet-600/15 px-2 py-0.5 text-violet-200 hover:bg-violet-600/25">
                família: {familiaSel} ✕
              </button>
            ) : null}
            {marcaSel ? (
              <button type="button" onClick={() => setMarcaSel("")} className="inline-flex items-center gap-1 rounded-full bg-violet-600/15 px-2 py-0.5 text-violet-200 hover:bg-violet-600/25">
                marca: {marcaSel} ✕
              </button>
            ) : null}
          </div>
        ) : null}
        <DataTable columns={colunas} rows={linhasCatalogo} searchable compactoInicial exportFilename="catalogo-estoque" estado={linhasCatalogo.length === 0 ? "vazio" : "ok"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// ABA: DISTRIBUIÇÃO (A5)
// ===========================================================================
function AbaDistribuicao({
  data, onFamilia, onMarca, familiaSel, marcaSel,
}: {
  data: EstoqueData;
  onFamilia: (l: string) => void; onMarca: (l: string) => void;
  familiaSel: string; marcaSel: string;
}) {
  const totalLocal = data.porLocal.valorGeral || 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Estoque por família" subtitle="Clique para filtrar o catálogo" icon={Layers}>
          <DonutChart data={data.porFamilia.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} onSelect={onFamilia} selecionado={familiaSel} maxFatias={8} />
        </SectionCard>
        <SectionCard title="Estoque por marca" subtitle="Clique para filtrar o catálogo" icon={Tag}>
          <DonutChart data={data.porMarca.linhas.map((l) => ({ label: l.chave, valor: l.valorTotal }))} onSelect={onMarca} selecionado={marcaSel} maxFatias={8} />
        </SectionCard>
      </div>
      <SectionCard title="Participação por local" subtitle={`Top 12 de ${data.porLocal.linhas.length} locais`} icon={Warehouse}>
        <div className="flex flex-col gap-2.5">
          {data.porLocal.linhas.slice(0, 12).map((l) => {
            const frac = l.valorTotal / totalLocal;
            return (
              <div key={l.chave} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-3">
                <span className="truncate text-sm" title={l.chave}>{l.chave}</span>
                <BarraParticipacao frac={frac} />
                <span className="w-36 shrink-0 text-right text-sm tabular-nums">{brl.format(l.valorTotal)} · {pct1(frac * 100)}</span>
              </div>
            );
          })}
        </div>
        {data.porLocal.linhas.length > 12 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            e mais {num.format(data.porLocal.linhas.length - 12)} locais (ver tabela completa na aba Estoque).
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// ABA: SERIAIS (A6)
// ===========================================================================
function AbaSeriais({ data }: { data: EstoqueData }) {
  const { seriais } = data;

  // A fonte (fato_serial) hoje só popula serial + produto; custo, data de
  // chegada, idade e local vêm vazios para todos os seriais. Em vez de exibir
  // R$ 0 / "-" / idade 0 (enganoso), mostramos só o que existe e sinalizamos
  // o gap. "Modelos com mais seriais" é uma agregação real e útil.
  const linhas = seriais.linhas.map((s: SerialLinha) => ({
    serial: s.serial ?? DASH,
    produto: s.produto ?? DASH,
  }));
  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "serial", header: "Serial", tipo: "texto" },
    { key: "produto", header: "Produto", tipo: "texto" },
  ];

  const porModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of seriais.linhas) {
      const k = s.produto ?? "Sem produto";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([produto, qtd]) => ({ produto, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [seriais.linhas]);
  const colunasModelo: ColumnDef<(typeof porModelo)[number]>[] = [
    { key: "produto", header: "Modelo", tipo: "texto" },
    { key: "qtd", header: "Seriais (amostra)", tipo: "numero" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Seriais cadastrados" valor={num.format(seriais.total)} icone={Barcode} tone="info" hint="Total na base de seriais" />
        <KpiButton rotulo="Modelos na amostra" valor={num.format(porModelo.length)} icone={Package} hint={`Distintos em ${num.format(seriais.linhas.length)} seriais`} />
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300/90">
        Custo, data de chegada, idade e local não estão preenchidos na fonte (Odoo)
        para os seriais. Exibimos serial e modelo até a origem fornecer esses campos.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Lista de seriais" subtitle={`${num.format(seriais.linhas.length)} de ${num.format(seriais.total)} seriais`} icon={Barcode}>
          <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="seriais-estoque" estado={linhas.length === 0 ? "vazio" : "ok"} />
        </SectionCard>
        <SectionCard title="Modelos com mais seriais" subtitle={`Na amostra de ${num.format(seriais.linhas.length)} seriais`} icon={Package}>
          <DataTable columns={colunasModelo} rows={porModelo} searchable compactoInicial exportFilename="seriais-por-modelo" estado={porModelo.length === 0 ? "vazio" : "ok"} />
        </SectionCard>
      </div>
    </div>
  );
}

// ===========================================================================
// ABA: COMPRAS (A7 , ordens ativas com filtro de prazo)
// ===========================================================================
type PrazoFiltro = "todas" | "no_prazo" | "atencao" | "atrasado" | "sem";
function AbaCompras({ data }: { data: EstoqueData }) {
  const { comprasAtivas } = data;
  const [filtro, setFiltro] = useState<PrazoFiltro>("todas");
  const [busca, setBusca] = useState("");

  const contagem = useMemo(() => {
    const c = { todas: comprasAtivas.linhas.length, no_prazo: 0, atencao: 0, atrasado: 0, sem: 0 };
    for (const l of comprasAtivas.linhas) {
      if (l.statusPrazo === null) c.sem += 1;
      else c[l.statusPrazo] += 1;
    }
    return c;
  }, [comprasAtivas.linhas]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return comprasAtivas.linhas
      .filter((l) => {
        if (filtro === "todas") return true;
        if (filtro === "sem") return l.statusPrazo === null;
        return l.statusPrazo === filtro;
      })
      .filter((l) => {
        if (!q) return true;
        return [l.numero, l.fornecedor, l.comprador, l.etapa].some((v) => (v ?? "").toLowerCase().includes(q));
      });
  }, [comprasAtivas.linhas, filtro, busca]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton rotulo="Compras ativas" valor={num.format(comprasAtivas.total)} icone={ShoppingCart} tone="info" hint="Ordens não recebidas" />
        <KpiButton rotulo="Valor em aberto" valor={brl.format(comprasAtivas.valorTotal)} icone={Wallet} hint="Soma das ordens ativas" />
        <KpiButton rotulo="Atrasadas" valor={num.format(comprasAtivas.atrasadas)} icone={AlertTriangle} tone={comprasAtivas.atrasadas > 0 ? "danger" : "success"} hint="Prazo previsto vencido" />
        <KpiButton rotulo="No prazo" valor={num.format(contagem.no_prazo)} icone={CheckCircle2} tone="success" hint="Dentro da previsão" />
      </div>

      <SectionCard
        title="Ordens de compra ativas"
        subtitle={`${num.format(linhas.length)} de ${num.format(comprasAtivas.total)} ordens`}
        icon={Truck}
        action={
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº, fornecedor, comprador…" className="h-8 w-56 text-sm" />
        }
      >
        <div className="mb-3">
          <ChipsFiltro
            opcoes={[
              { id: "todas", label: "Todas", count: contagem.todas },
              { id: "atrasado", label: "Atrasadas", count: contagem.atrasado },
              { id: "atencao", label: "Atenção", count: contagem.atencao },
              { id: "no_prazo", label: "No prazo", count: contagem.no_prazo },
              { id: "sem", label: "Sem previsão", count: contagem.sem },
            ]}
            valor={filtro}
            onChange={setFiltro}
          />
        </div>
        {linhas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma ordem para este filtro.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((c: CompraAtivaLinha, i) => (
                  <TableRow key={c.numero ?? i} className="hover:bg-muted/40">
                    <TableCell className="font-medium tabular-nums">{c.numero ?? DASH}</TableCell>
                    <TableCell>{c.fornecedor ?? DASH}</TableCell>
                    <TableCell className="text-muted-foreground">{c.comprador ?? DASH}</TableCell>
                    <TableCell>
                      {c.etapa ? <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">{c.etapa}</span> : DASH}
                    </TableCell>
                    <TableCell><PrazoBadge status={c.statusPrazo} dias={c.diasRestantes} /></TableCell>
                    <TableCell className="text-right tabular-nums">{brl.format(c.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// ABA: FORNECEDORES (A8 , resumo + matriz + compras por fornecedor)
// ===========================================================================
type FornFiltro = "todos" | "ativas" | "atrasadas" | "apagar";
function AbaFornecedores({ data }: { data: EstoqueData }) {
  const { resumoCompras, comprasFornecedor } = data;
  const [filtro, setFiltro] = useState<FornFiltro>("todos");

  const linhas = useMemo(() => {
    return resumoCompras.fornecedores
      .filter((f: FornecedorResumo) => {
        if (filtro === "ativas") return f.ativas > 0;
        if (filtro === "atrasadas") return f.atrasadas > 0;
        if (filtro === "apagar") return f.aPagar > 0;
        return true;
      })
      .map((f) => ({
        fornecedor: f.fornecedor,
        ativas: f.ativas,
        comprado: f.comprado,
        pago: f.pago,
        aPagar: f.aPagar,
        atrasadas: f.atrasadas,
      }));
  }, [resumoCompras.fornecedores, filtro]);

  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "fornecedor", header: "Fornecedor", tipo: "texto" },
    { key: "ativas", header: "Ativas", tipo: "numero" },
    { key: "comprado", header: "Comprado", tipo: "moeda" },
    { key: "pago", header: "Pago", tipo: "moeda" },
    { key: "aPagar", header: "A pagar", tipo: "moeda" },
    { key: "atrasadas", header: "Atrasadas", tipo: "numero" },
  ];

  const pagoPct = resumoCompras.totalComprado > 0 ? (resumoCompras.totalPago / resumoCompras.totalComprado) * 100 : 0;
  const aPagarPct = resumoCompras.totalComprado > 0 ? (resumoCompras.totalAPagar / resumoCompras.totalComprado) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs-filtro */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiButton rotulo="Comprado" valor={brlCompacto(resumoCompras.totalComprado)} icone={CircleDollarSign} hint="Total em ordens" />
        <KpiButton rotulo="Pago" valor={brlCompacto(resumoCompras.totalPago)} icone={CheckCircle2} tone="success" hint={`${pct1(pagoPct)} do total`} />
        <KpiButton rotulo="A pagar" valor={brlCompacto(resumoCompras.totalAPagar)} icone={Wallet} tone="warning" hint={`${pct1(aPagarPct)} pendente`} onClick={() => setFiltro(filtro === "apagar" ? "todos" : "apagar")} selecionado={filtro === "apagar"} />
        <KpiButton rotulo="Ativas" valor={num.format(resumoCompras.comprasAtivas)} icone={Truck} tone="info" hint="Filtrar fornecedores" onClick={() => setFiltro(filtro === "ativas" ? "todos" : "ativas")} selecionado={filtro === "ativas"} />
        <KpiButton rotulo="Atrasadas" valor={num.format(resumoCompras.atrasadas)} icone={AlertTriangle} tone={resumoCompras.atrasadas > 0 ? "danger" : "success"} hint="Filtrar fornecedores" onClick={() => setFiltro(filtro === "atrasadas" ? "todos" : "atrasadas")} selecionado={filtro === "atrasadas"} />
      </div>

      <SectionCard
        title="Matriz por fornecedor"
        subtitle={`${num.format(linhas.length)} de ${num.format(resumoCompras.fornecedores.length)} fornecedores${filtro !== "todos" ? " (filtrado)" : ""} · ordens de compra`}
        icon={Building2}
      >
        <DataTable columns={colunas} rows={linhas} searchable compactoInicial exportFilename="fornecedores" estado={linhas.length === 0 ? "vazio" : "ok"} />
      </SectionCard>
      <SectionCard title="Compras por fornecedor" subtitle="Notas fiscais de entrada (valor por fornecedor)" icon={Truck}>
        <DonutChart data={comprasFornecedor.linhas.map((c) => ({ label: c.fornecedor, valor: c.valorTotal }))} maxFatias={8} />
      </SectionCard>
    </div>
  );
}
