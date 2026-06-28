"use client";

// src/components/reports/builder/report-renderer.tsx
// Motor de render do construtor com EXATAMENTE os componentes do dashboard
// "Consumo do Agente Nex": KpiCard (faixa de indicadores), InteractiveAreaChart
// (linha/area animada), InteractiveBarChart (barras animadas), DonutWithCenter
// (rosca com centro) e ReportDataTable (tabela paginada padrao Consumo). Cada
// grafico/tabela vive num Card (CardHeader icone violeta + titulo), iguais aos
// tokens/espacamentos do consumo.
import * as React from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  Coins,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Filter as FunnelIcon,
  BarChartHorizontal as WaterfallIcon,
  Table as TableIcon,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Check,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/reports/kpi-card";
import { formatNumber, type NumberFormat } from "@/components/charts/kpi-card";
import {
  InteractiveAreaChart,
  InteractiveBarChart,
  DonutWithCenter,
  InteractiveFunnelChart,
  InteractiveWaterfallChart,
  type AreaChartData,
  type BarChartData,
  type PieChartData,
  type FunnelDatum,
  type PassoCascata,
  type PassoCascataTipo,
} from "@/components/charts/interactive";
import {
  CHART_COLORS,
  corResolvida,
  paletaApartirDe,
  CORES_SELECIONAVEIS,
} from "@/components/charts/colors";
import { ReportDataTable, type ColunaTabela } from "./report-data-table";
import type {
  BuilderReportEntry,
  BuilderSection,
  CampoMeta,
  CampoTipo,
} from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

function formatoDoCampo(tipo: CampoTipo | undefined): NumberFormat {
  if (tipo === "moeda") return "moeda";
  if (tipo === "numero") return "inteiro";
  return "decimal";
}

/** Formatador de valor para eixos/tooltip a partir do tipo do campo. */
function formatadorValor(tipo: CampoTipo | undefined): (v: number) => string {
  const fmt = formatoDoCampo(tipo);
  if (tipo === "percentual") return (v) => `${formatNumber(v, "decimal")}%`;
  return (v) => formatNumber(v, fmt);
}

function ehEscalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== "object";
}

/** Icone + titulo padrao do Card de cada template. */
function metaTemplate(template: string): { Icon: LucideIcon; titulo: string } {
  switch (template) {
    case "KPIRow":
      return { Icon: Boxes, titulo: "Indicadores" };
    case "BarChart":
      return { Icon: BarChart3, titulo: "Comparacao por categoria" };
    case "PieChart":
      return { Icon: PieIcon, titulo: "Distribuicao" };
    case "LineChart":
      return { Icon: TrendingUp, titulo: "Evolucao no tempo" };
    case "Funnel":
      return { Icon: FunnelIcon, titulo: "Funil por etapa" };
    case "Waterfall":
      return { Icon: WaterfallIcon, titulo: "Resultado em cascata" };
    default:
      return { Icon: TableIcon, titulo: "Detalhe" };
  }
}

/** Card com cabecalho (icone violeta + titulo), igual ao dashboard de consumo. */
function CardSecao({
  Icon,
  titulo,
  tituloNode,
  acao,
  children,
}: {
  Icon: LucideIcon;
  titulo: string;
  tituloNode?: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="group/sec rounded-2xl border border-border bg-muted/30">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
          {tituloNode ?? titulo}
        </CardTitle>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Handlers do modo de edicao da ficha (preview do construtor). */
export interface EditavelFicha {
  onMover: (secaoId: string, direcao: "cima" | "baixo") => void;
  onRemover: (secaoId: string) => void;
  onRenomear: (secaoId: string, titulo: string) => void;
  /** Define a cor da secao (token da paleta); `null` volta ao padrao. */
  onCor: (secaoId: string, cor: string | null) => void;
}

/** Templates de grafico que aceitam escolha de cor pela UI. */
const TEMPLATES_COM_COR = new Set(["BarChart", "PieChart", "LineChart", "Funnel"]);

/** Cor atual da secao (config.cor), normalizada para string|undefined. */
function corDaSecao(secao: BuilderSection): string | undefined {
  const c = secao.config?.cor;
  return typeof c === "string" && c.trim() ? c.trim() : undefined;
}

/** Controles de uma secao no modo edicao: subir, descer, remover. */
function SecaoControls({
  secaoId,
  primeira,
  ultima,
  ed,
}: {
  secaoId: string;
  primeira: boolean;
  ultima: boolean;
  ed: EditavelFicha;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer";
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label="Subir secao" disabled={primeira} onClick={() => ed.onMover(secaoId, "cima")} className={btn}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Descer secao" disabled={ultima} onClick={() => ed.onMover(secaoId, "baixo")} className={btn}>
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Remover secao"
        onClick={() => ed.onRemover(secaoId)}
        className={cn(btn, "hover:bg-destructive/10 hover:text-destructive")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Titulo editavel inline (clica no lapis, edita, Enter/check salva). */
function TituloEditavel({ titulo, onSalvar }: { titulo: string; onSalvar: (t: string) => void }) {
  const [editando, setEditando] = React.useState(false);
  const [valor, setValor] = React.useState(titulo);
  React.useEffect(() => setValor(titulo), [titulo]);
  if (!editando) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{titulo}</span>
        <button
          type="button"
          aria-label="Renomear secao"
          onClick={() => setEditando(true)}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition hover:bg-muted hover:text-foreground group-hover/sec:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }
  const salvar = () => {
    const t = valor.trim();
    if (t) onSalvar(t);
    setEditando(false);
  };
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") setEditando(false);
        }}
        className="h-7 w-44 rounded-md border border-border bg-background px-2 text-sm font-normal text-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
      />
      <button type="button" aria-label="Salvar nome" onClick={salvar} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-violet-500 hover:bg-muted">
        <Check className="h-4 w-4" />
      </button>
    </span>
  );
}

/** Seletor de cor da secao: bolinha que abre uma paleta. */
function SecaoColorPicker({
  secaoId,
  corAtual,
  onCor,
}: {
  secaoId: string;
  corAtual?: string;
  onCor: (secaoId: string, cor: string | null) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);
  const hexAtual = corResolvida(corAtual);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Escolher cor da secao"
        onClick={() => setAberto((v) => !v)}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
      >
        {hexAtual ? (
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: hexAtual }} />
        ) : (
          <Palette className="h-4 w-4" />
        )}
      </button>
      {aberto ? (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border bg-popover p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {CORES_SELECIONAVEIS.map((c) => {
              const sel = hexAtual?.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.token}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={sel}
                  onClick={() => {
                    onCor(secaoId, c.token);
                    setAberto(false);
                  }}
                  className={cn(
                    "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full ring-1 ring-black/10 transition hover:scale-110 dark:ring-white/15",
                    sel && "ring-2 ring-violet-500 ring-offset-1 ring-offset-popover",
                  )}
                  style={{ backgroundColor: c.hex }}
                >
                  {sel ? <Check className="h-3.5 w-3.5 text-white drop-shadow" /> : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onCor(secaoId, null);
              setAberto(false);
            }}
            className="mt-2 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cor padrao
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Colunas da tabela: do contrato (campos) ou derivadas da 1a linha. */
function colunasDataTable(secao: BuilderSection, campos: CampoMeta[], rows: Record<string, unknown>[]): ColunaTabela[] {
  let colunas = (secao.config.colunas as ColunaTabela[] | undefined) ?? [];
  if (colunas.length === 0 && campos.length > 0) {
    colunas = campos.map((c) => ({ key: c.key, header: c.label, tipo: c.tipo }));
  }
  if (colunas.length === 0 && rows.length > 0) {
    colunas = Object.keys(rows[0])
      .filter((k) => ehEscalar(rows[0][k]))
      .map((k) => ({ key: k, header: humanizarChave(k) }));
  }
  return colunas.filter((c) => c && c.key).map((c) => ({ key: c.key, header: c.header ?? c.key, tipo: c.tipo }));
}

function SecaoView({
  secao,
  resolvida,
  editavel,
  primeira = false,
  ultima = false,
}: {
  secao: BuilderSection;
  resolvida?: SecaoResolvida;
  editavel?: EditavelFicha;
  primeira?: boolean;
  ultima?: boolean;
}) {
  const { Icon, titulo: tituloPadrao } = metaTemplate(secao.template);
  const titulo = tituloSecao(secao) ?? tituloPadrao;
  const editProps: { tituloNode?: React.ReactNode; acao?: React.ReactNode } = editavel
    ? {
        tituloNode: <TituloEditavel titulo={titulo} onSalvar={(t) => editavel.onRenomear(secao.id, t)} />,
        acao: (
          <div className="flex items-center gap-0.5">
            {TEMPLATES_COM_COR.has(secao.template) ? (
              <SecaoColorPicker secaoId={secao.id} corAtual={corDaSecao(secao)} onCor={editavel.onCor} />
            ) : null}
            <SecaoControls secaoId={secao.id} primeira={primeira} ultima={ultima} ed={editavel} />
          </div>
        ),
      }
    : {};

  if (!resolvida || resolvida.estado === "erro") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      >
        Nao foi possivel carregar esta secao
        {resolvida?.erro ? ` (${resolvida.erro})` : ""}.
      </div>
    );
  }
  if (resolvida.estado === "vazio") {
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <p className="py-6 text-center text-sm text-muted-foreground">Sem dados para esta secao.</p>
      </CardSecao>
    );
  }

  // KPIRow , faixa de indicadores (cada um e um KpiCard), com entrada animada.
  if (secao.template === "KPIRow") {
    const kpis = (resolvida.dado as Record<string, number>) ?? {};
    const campos = resolvida.campos ?? [];
    // Subtitulo (descricao da metrica) e ordem/subset vem do build (config).
    const subtitulos = (secao.config.subtitulos as Record<string, string> | undefined) ?? {};
    const ordem = secao.config.campos as string[] | undefined;
    let base =
      campos.length > 0
        ? campos
        : Object.keys(kpis).map((k) => ({ key: k, label: humanizarChave(k), tipo: "numero" as CampoTipo }));
    if (ordem && ordem.length > 0) {
      base = ordem.map(
        (k) => base.find((c) => c.key === k) ?? { key: k, label: humanizarChave(k), tipo: "numero" as CampoTipo },
      );
    }
    const cards = base.filter((c) => c.key in kpis);
    if (cards.length === 0) return null;
    const grid = (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((c) => {
          const valor = Number(kpis[c.key] ?? 0);
          const tone =
            /negativ/i.test(c.key) || /negativ/i.test(c.label)
              ? valor > 0
                ? ("danger" as const)
                : ("success" as const)
              : ("default" as const);
          const Ico = c.tipo === "moeda" ? Coins : /produto|item|total|armaz/i.test(c.key) ? Boxes : TrendingUp;
          return (
            <motion.div
              key={c.key}
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } } }}
            >
              <KpiCard
                icon={Ico}
                label={c.label}
                value={formatNumber(valor, formatoDoCampo(c.tipo))}
                tone={tone}
                subtitle={subtitulos[c.key]}
                hint={!subtitulos[c.key] && c.tipo === "moeda" ? "no periodo" : undefined}
              />
            </motion.div>
          );
        })}
      </motion.div>
    );
    if (!editavel) return grid;
    return (
      <div className="group/sec flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground/80">
            <Boxes className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            {editProps.tituloNode}
          </div>
          {editProps.acao}
        </div>
        {grid}
      </div>
    );
  }

  // BarChart , barras animadas (InteractiveBarChart). 1 serie "valor".
  if (secao.template === "BarChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    const barData: BarChartData[] = data.map((d) => ({ name: String(d.rotulo ?? ""), valor: Number(d.valor ?? 0) }));
    const cor = corResolvida(corDaSecao(secao)) ?? CHART_COLORS.violet;
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <InteractiveBarChart
          data={barData}
          series={[{ key: "valor", label: campoValor?.label ?? "Valor", color: cor }]}
          height={320}
          layout={barData.length > 6 ? "horizontal" : "vertical"}
          yAxisWidth={barData.length > 6 ? 160 : undefined}
          showLegend={false}
          formatValue={formatadorValor(campoValor?.tipo)}
          yAxisCurrency={campoValor?.tipo === "moeda" ? "BRL" : undefined}
          emptyMessage="Sem dados para esta secao."
        />
      </CardSecao>
    );
  }

  // LineChart , linha/area animada (InteractiveAreaChart) multi-serie.
  if (secao.template === "LineChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campos = resolvida.campos ?? [];
    const xCampo = campos.find((c) => c.tipo === "texto") ?? campos[0];
    const numericos = campos.filter((c) => c.tipo === "numero" || c.tipo === "moeda");
    const paleta = paletaApartirDe(corDaSecao(secao));
    const series = numericos.map((c, i) => ({ key: c.key, label: c.label, color: paleta[i % paleta.length] }));
    const areaData: AreaChartData[] = data.map((d) => {
      const row: AreaChartData = { name: String(d[xCampo?.key ?? "mes"] ?? "") };
      for (const c of numericos) row[c.key] = Number(d[c.key] ?? 0);
      return row;
    });
    const formatoSerie = numericos[0]?.tipo;
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <InteractiveAreaChart
          data={areaData}
          series={series}
          height={300}
          showLegend={series.length > 1}
          formatValue={formatadorValor(formatoSerie)}
          yAxisCurrency={formatoSerie === "moeda" ? "BRL" : undefined}
          emptyMessage="Sem dados para esta secao."
        />
      </CardSecao>
    );
  }

  // PieChart , rosca com centro (DonutWithCenter).
  if (secao.template === "PieChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    const paleta = paletaApartirDe(corDaSecao(secao));
    const pieData: PieChartData[] = data.map((d, i) => ({
      name: String(d.rotulo ?? ""),
      value: Number(d.valor ?? 0),
      color: paleta[i % paleta.length],
    }));
    const total = pieData.reduce((s, p) => s + p.value, 0);
    const fmt = formatadorValor(campoValor?.tipo);
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <DonutWithCenter
          data={pieData}
          centerLabel={campoValor?.label ?? "Total"}
          centerValue={fmt(total)}
          formatValue={fmt}
          emptyMessage="Sem dados para esta secao."
        />
      </CardSecao>
    );
  }

  // Funnel , funil de conversao (InteractiveFunnelChart). Mesmo shape da barra.
  if (secao.template === "Funnel") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    const funnelData: FunnelDatum[] = data.map((d) => ({ name: String(d.rotulo ?? ""), value: Number(d.valor ?? 0) }));
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <InteractiveFunnelChart
          data={funnelData}
          color={corDaSecao(secao)}
          formatValue={formatadorValor(campoValor?.tipo)}
          emptyMessage="Sem dados para esta secao."
        />
      </CardSecao>
    );
  }

  // Waterfall , cascata (DRE) a partir do shape "cascata" (passos com sinal).
  if (secao.template === "Waterfall") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    const passos: PassoCascata[] = data.map((d) => ({
      rotulo: String(d.rotulo ?? ""),
      valor: Number(d.valor ?? 0),
      tipo: (d.tipo as PassoCascataTipo) ?? "positivo",
    }));
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <InteractiveWaterfallChart
          passos={passos}
          formatValue={formatadorValor(campoValor?.tipo)}
          emptyMessage="Sem dados para esta secao."
        />
      </CardSecao>
    );
  }

  // DataTable , tabela paginada no padrao Consumo.
  if (secao.template === "DataTable") {
    const rows = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campos = resolvida.campos ?? [];
    const colunas = colunasDataTable(secao, campos, rows);
    if (colunas.length === 0) {
      return (
        <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
          <p className="py-6 text-center text-sm text-muted-foreground">Sem colunas para esta secao.</p>
        </CardSecao>
      );
    }
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <ReportDataTable columns={colunas} rows={rows} />
      </CardSecao>
    );
  }

  return (
    <CardSecao Icon={Icon} titulo={titulo}>
      <p className="py-6 text-center text-sm text-muted-foreground">
        Este tipo de visual ainda nao e suportado pelo construtor.
      </p>
    </CardSecao>
  );
}

/** Titulo curto e opcional de uma secao (config.titulo). */
function tituloSecao(secao: BuilderSection): string | null {
  const t = secao.config?.titulo;
  return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
}

/**
 * Agrupa secoes irmas consecutivas que compartilham `config.grupoId` (ex.: o par
 * tendencia+distribuicao do bloco composto), para o renderer posiciona-las lado a lado.
 * Secoes sem grupoId (ou isoladas) viram grupos de 1 (render solo, como sempre).
 */
function agruparPorGrupoId(secoes: BuilderSection[]): BuilderSection[][] {
  const grupos: BuilderSection[][] = [];
  for (const secao of secoes) {
    const g = secao.config?.grupoId;
    const ultimo = grupos[grupos.length - 1];
    if (typeof g === "string" && g && ultimo && ultimo[0].config?.grupoId === g) {
      ultimo.push(secao);
    } else {
      grupos.push([secao]);
    }
  }
  return grupos;
}

/** "Atualizado ha Xs/min/h/d" a partir do instante do ultimo build do dado. */
function atualizadoHa(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `Atualizado ha ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Atualizado ha ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Atualizado ha ${h}h`;
  return `Atualizado ha ${Math.floor(h / 24)}d`;
}

export function ReportRenderer({
  entry,
  dados,
  editavel,
  freshness,
}: {
  entry: BuilderReportEntry;
  dados: Record<string, SecaoResolvida>;
  editavel?: EditavelFicha;
  freshness?: Date | null;
}) {
  const total = entry.secoes.length;
  const grupos = agruparPorGrupoId(entry.secoes);
  let idx = 0;
  return (
    <div className="flex flex-col gap-4">
      {entry.titulo ? (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-foreground">{entry.titulo}</h1>
            {entry.descricao ? <p className="mt-0.5 text-xs text-muted-foreground">{entry.descricao}</p> : null}
          </div>
          {freshness ? (
            <span className="shrink-0 text-[11px] text-muted-foreground/70" title={freshness.toLocaleString("pt-BR")}>
              {atualizadoHa(freshness)}
            </span>
          ) : null}
        </div>
      ) : null}
      {grupos.map((grupo, gi) => {
        if (grupo.length > 1) {
          // Par lado a lado (tendencia 2/3 + distribuicao 1/3 no desktop; empilhado no
          // mobile). Cada metade mantem seu proprio estado (vazio/erro) , uma vazia nao
          // derruba a outra.
          return (
            <div key={`grupo-${gi}`} data-testid="secao-grupo" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {grupo.map((secao, j) => {
                const i = idx++;
                return (
                  <div key={secao.id} className={j === 0 ? "lg:col-span-2" : ""}>
                    <SecaoView secao={secao} resolvida={dados[secao.id]} editavel={editavel} primeira={i === 0} ultima={i === total - 1} />
                  </div>
                );
              })}
            </div>
          );
        }
        const secao = grupo[0];
        const i = idx++;
        return (
          <SecaoView
            key={secao.id}
            secao={secao}
            resolvida={dados[secao.id]}
            editavel={editavel}
            primeira={i === 0}
            ultima={i === total - 1}
          />
        );
      })}
    </div>
  );
}

/** camelCase / snake_case -> "Texto legivel" para cabecalho derivado. */
function humanizarChave(k: string): string {
  const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
