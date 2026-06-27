"use client";

// src/components/reports/builder/report-renderer.tsx
// Motor de render do construtor, na MESMA pegada visual do dashboard "Consumo do
// Agente Nex": KPIs em KpiCard (icone em pilula + valor grande), e cada grafico/
// tabela dentro de um Card com cabecalho (icone violeta + titulo). Espacamentos,
// cores e cantos seguem o design system (rounded-2xl, border, bg-muted/30).
import * as React from "react";
import {
  Boxes,
  Coins,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Table as TableIcon,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/reports/kpi-card";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { formatNumber, type NumberFormat } from "@/components/charts/kpi-card";
import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import type {
  BuilderReportEntry,
  BuilderSection,
  CampoMeta,
  CampoTipo,
} from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

interface ColunaConfig {
  key: string;
  header: string;
  tipo?: CampoTipo;
}

function formatoDoCampo(tipo: CampoTipo | undefined): NumberFormat {
  if (tipo === "moeda") return "moeda";
  if (tipo === "numero") return "inteiro";
  return "decimal";
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
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold">
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
  // Props injetadas em cada CardSecao quando em modo edicao (titulo editavel +
  // controles de reordenar/remover no canto do cabecalho).
  const editProps: { tituloNode?: React.ReactNode; acao?: React.ReactNode } = editavel
    ? {
        tituloNode: (
          <TituloEditavel titulo={titulo} onSalvar={(t) => editavel.onRenomear(secao.id, t)} />
        ),
        acao: <SecaoControls secaoId={secao.id} primeira={primeira} ultima={ultima} ed={editavel} />,
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

  // KPIRow , faixa de indicadores (cada um e um KpiCard, sem Card externo).
  if (secao.template === "KPIRow") {
    const kpis = (resolvida.dado as Record<string, number>) ?? {};
    const campos = resolvida.campos ?? [];
    const cards = (campos.length > 0
      ? campos
      : Object.keys(kpis).map((k) => ({ key: k, label: humanizarChave(k), tipo: "numero" as CampoTipo }))
    ).filter((c) => c.key in kpis);
    if (cards.length === 0) return null;
    const grid = (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <KpiCard
              key={c.key}
              icon={Ico}
              label={c.label}
              value={formatNumber(valor, formatoDoCampo(c.tipo))}
              tone={tone}
              hint={c.tipo === "moeda" ? "no periodo" : undefined}
            />
          );
        })}
      </div>
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

  if (secao.template === "BarChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <BarChartCard data={data} config={{ xKey: "rotulo", yKey: "valor", formato: formatoDoCampo(campoValor?.tipo) }} />
      </CardSecao>
    );
  }

  if (secao.template === "LineChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campos = resolvida.campos ?? [];
    const xCampo = campos.find((c) => c.tipo === "texto") ?? campos[0];
    const series = campos
      .filter((c) => c.tipo === "numero" || c.tipo === "moeda")
      .map((c) => ({ key: c.key, label: c.label }));
    const formatoSerie = campos.find((c) => c.tipo === "numero" || c.tipo === "moeda")?.tipo;
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <LineChartCard data={data} config={{ xKey: xCampo?.key ?? "mes", formato: formatoDoCampo(formatoSerie), series }} />
      </CardSecao>
    );
  }

  if (secao.template === "PieChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <PieChartCard data={data} config={{ nameKey: "rotulo", valueKey: "valor", formato: formatoDoCampo(campoValor?.tipo) }} />
      </CardSecao>
    );
  }

  if (secao.template === "DataTable") {
    const rows = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campos = resolvida.campos ?? [];
    let colunas = (secao.config.colunas as ColunaConfig[] | undefined) ?? [];
    if (colunas.length === 0 && campos.length > 0) {
      colunas = campos.map((c: CampoMeta) => ({ key: c.key, header: c.label, tipo: c.tipo }));
    }
    if (colunas.length === 0 && rows.length > 0) {
      colunas = Object.keys(rows[0])
        .filter((k) => ehEscalar(rows[0][k]))
        .map((k) => ({ key: k, header: humanizarChave(k) }));
    }
    const columns: ColumnDef<Record<string, unknown>>[] = colunas
      .filter((c) => c && c.key)
      .map((c) => ({ key: c.key, header: c.header ?? c.key, tipo: c.tipo ?? "texto" }));
    if (columns.length === 0) {
      return (
        <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
          <p className="py-6 text-center text-sm text-muted-foreground">Sem colunas para esta secao.</p>
        </CardSecao>
      );
    }
    return (
      <CardSecao Icon={Icon} titulo={titulo} {...editProps}>
        <DataTable columns={columns} rows={rows} searchable />
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

export function ReportRenderer({
  entry,
  dados,
  editavel,
}: {
  entry: BuilderReportEntry;
  dados: Record<string, SecaoResolvida>;
  /** Quando presente, mostra controles de edicao por secao (preview do construtor). */
  editavel?: EditavelFicha;
}) {
  const total = entry.secoes.length;
  return (
    <div className="flex flex-col gap-4">
      {entry.titulo ? (
        <div className="mb-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">{entry.titulo}</h1>
          {entry.descricao ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{entry.descricao}</p>
          ) : null}
        </div>
      ) : null}
      {entry.secoes.map((secao, i) => (
        <SecaoView
          key={secao.id}
          secao={secao}
          resolvida={dados[secao.id]}
          editavel={editavel}
          primeira={i === 0}
          ultima={i === total - 1}
        />
      ))}
    </div>
  );
}

/** camelCase / snake_case -> "Texto legivel" para cabecalho derivado. */
function humanizarChave(k: string): string {
  const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
