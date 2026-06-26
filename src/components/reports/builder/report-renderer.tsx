"use client";

// src/components/reports/builder/report-renderer.tsx
// Motor de render do construtor: recebe a ficha + os dados JA resolvidos
// (a resolucao acontece no server) e desenha secao a secao reusando os
// componentes da plataforma. Templates suportados: KPIRow (indicadores),
// BarChart (comparacao por categoria) e DataTable (detalhe linha a linha).
import { Boxes, Coins, TrendingUp } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { KPICard, type NumberFormat } from "@/components/charts/kpi-card";
import { BarChartCard } from "@/components/charts/bar-chart";
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

/** Mapeia o tipo de campo do contrato para o formato numerico dos componentes. */
function formatoDoCampo(tipo: CampoTipo | undefined): NumberFormat {
  if (tipo === "moeda") return "moeda";
  if (tipo === "numero") return "inteiro";
  return "decimal"; // percentual/texto caem aqui (texto nao chega em KPI/chart)
}

/** Valor escalar simples (nao objeto/array): seguro para exibir em celula. */
function ehEscalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== "object";
}

function SecaoView({
  secao,
  resolvida,
}: {
  secao: BuilderSection;
  resolvida?: SecaoResolvida;
}) {
  if (!resolvida || resolvida.estado === "erro") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      >
        Nao foi possivel carregar esta secao
        {resolvida?.erro ? ` (${resolvida.erro})` : ""}.
      </div>
    );
  }
  if (resolvida.estado === "vazio") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Sem dados para esta secao.
      </div>
    );
  }

  // KPIRow , faixa de indicadores no topo do relatorio.
  if (secao.template === "KPIRow") {
    const kpis = (resolvida.dado as Record<string, number>) ?? {};
    const campos = resolvida.campos ?? [];
    const cards = (campos.length > 0
      ? campos
      : Object.keys(kpis).map((k) => ({ key: k, label: humanizarChave(k), tipo: "numero" as CampoTipo }))
    ).filter((c) => c.key in kpis);
    if (cards.length === 0) {
      return <SemConteudo texto="Sem indicadores para esta secao." />;
    }
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
          const Icon = c.tipo === "moeda" ? Coins : /produto|item|total/i.test(c.key) ? Boxes : TrendingUp;
          return (
            <KPICard
              key={c.key}
              valor={valor}
              rotulo={c.label}
              formato={formatoDoCampo(c.tipo)}
              tone={tone}
              icone={Icon}
            />
          );
        })}
      </div>
    );
  }

  // BarChart , comparacao por categoria (agregacaoCategorica: {rotulo, valor}).
  if (secao.template === "BarChart") {
    const data = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campoValor = (resolvida.campos ?? []).find((c) => c.key === "valor");
    return (
      <BarChartCard
        data={data}
        config={{ xKey: "rotulo", yKey: "valor", formato: formatoDoCampo(campoValor?.tipo) }}
      />
    );
  }

  // DataTable , detalhe linha a linha.
  if (secao.template === "DataTable") {
    const rows = (resolvida.dado as Record<string, unknown>[]) ?? [];
    const campos = resolvida.campos ?? [];
    let colunas = (secao.config.colunas as ColunaConfig[] | undefined) ?? [];
    // 1a opcao: colunas que o agente declarou. 2a: campos do contrato (com tipo
    // certo). 3a: deriva das chaves ESCALARES do dado (nunca objeto/array, pra
    // nao renderizar "[object Object]").
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
      return <SemConteudo texto="Sem colunas para esta secao." />;
    }
    return <DataTable columns={columns} rows={rows} searchable />;
  }

  return <SemConteudo texto="Este tipo de visual ainda nao e suportado pelo construtor." />;
}

function SemConteudo({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      {texto}
    </div>
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
    <div className="flex flex-col gap-6">
      {entry.titulo ? (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{entry.titulo}</h1>
          {entry.descricao ? (
            <p className="mt-1 text-sm text-muted-foreground">{entry.descricao}</p>
          ) : null}
        </div>
      ) : null}
      {entry.secoes.map((secao) => {
        const titulo = tituloSecao(secao);
        return (
          <section key={secao.id} className="flex flex-col gap-2">
            {titulo ? (
              <h2 className="text-sm font-semibold text-foreground/80">{titulo}</h2>
            ) : null}
            <SecaoView secao={secao} resolvida={dados[secao.id]} />
          </section>
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
