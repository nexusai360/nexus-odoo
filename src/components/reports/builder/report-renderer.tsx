"use client";

// src/components/reports/builder/report-renderer.tsx
// Motor de render do construtor: recebe a ficha + os dados JA resolvidos
// (a resolucao acontece no server, na rota /relatorios/d/[savedId]) e desenha
// secao a secao reusando os componentes da plataforma. Onda 1: so DataTable.
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import type {
  BuilderReportEntry,
  BuilderSection,
} from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

interface ColunaConfig {
  key: string;
  header: string;
  tipo?: "texto" | "numero" | "moeda" | "percentual";
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
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Nao foi possivel carregar esta secao
        {resolvida?.erro ? ` (${resolvida.erro})` : ""}.
      </div>
    );
  }
  if (resolvida.estado === "vazio") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Sem dados para esta secao.
      </div>
    );
  }
  if (secao.template === "DataTable") {
    const rows = (resolvida.dado as Record<string, unknown>[]) ?? [];
    let colunas = (secao.config.colunas as ColunaConfig[] | undefined) ?? [];
    // Fallback: quando o agente nao define `colunas`, deriva das chaves do dado
    // (evita tabela vazia + erro de key por colunas inexistentes).
    if (colunas.length === 0 && rows.length > 0) {
      colunas = Object.keys(rows[0]).map((k) => ({ key: k, header: humanizarChave(k) }));
    }
    const columns: ColumnDef<Record<string, unknown>>[] = colunas
      .filter((c) => c && c.key)
      .map((c) => ({ key: c.key, header: c.header ?? c.key, tipo: c.tipo ?? "texto" }));
    if (columns.length === 0) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Sem colunas para esta secao.
        </div>
      );
    }
    return <DataTable columns={columns} rows={rows} searchable />;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
      Este tipo de visual ainda nao e suportado pelo construtor.
    </div>
  );
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
        <h1 className="text-2xl font-semibold text-slate-900">{entry.titulo}</h1>
      ) : null}
      {entry.secoes.map((secao) => (
        <section key={secao.id}>
          <SecaoView secao={secao} resolvida={dados[secao.id]} />
        </section>
      ))}
    </div>
  );
}

/** camelCase / snake_case -> "Texto legivel" para cabecalho derivado. */
function humanizarChave(k: string): string {
  const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
