"use client";

// src/components/reports/builder/report-renderer.tsx
// Motor de render do construtor, na MESMA pegada visual do dashboard "Consumo do
// Agente Nex": KPIs em KpiCard (icone em pilula + valor grande), e cada grafico/
// tabela dentro de um Card com cabecalho (icone violeta + titulo). Espacamentos,
// cores e cantos seguem o design system (rounded-2xl, border, bg-muted/30).
import {
  Boxes,
  Coins,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
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
  children,
}: {
  Icon: LucideIcon;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-border bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-violet-500" aria-hidden />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SecaoView({
  secao,
  resolvida,
}: {
  secao: BuilderSection;
  resolvida?: SecaoResolvida;
}) {
  const { Icon, titulo: tituloPadrao } = metaTemplate(secao.template);
  const titulo = tituloSecao(secao) ?? tituloPadrao;

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
      <CardSecao Icon={Icon} titulo={titulo}>
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
    return (
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
  }

  if (secao.template === "BarChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    return (
      <CardSecao Icon={Icon} titulo={titulo}>
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
      <CardSecao Icon={Icon} titulo={titulo}>
        <LineChartCard data={data} config={{ xKey: xCampo?.key ?? "mes", formato: formatoDoCampo(formatoSerie), series }} />
      </CardSecao>
    );
  }

  if (secao.template === "PieChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    return (
      <CardSecao Icon={Icon} titulo={titulo}>
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
        <CardSecao Icon={Icon} titulo={titulo}>
          <p className="py-6 text-center text-sm text-muted-foreground">Sem colunas para esta secao.</p>
        </CardSecao>
      );
    }
    return (
      <CardSecao Icon={Icon} titulo={titulo}>
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
}: {
  entry: BuilderReportEntry;
  dados: Record<string, SecaoResolvida>;
}) {
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
      {entry.secoes.map((secao) => (
        <SecaoView key={secao.id} secao={secao} resolvida={dados[secao.id]} />
      ))}
    </div>
  );
}

/** camelCase / snake_case -> "Texto legivel" para cabecalho derivado. */
function humanizarChave(k: string): string {
  const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
