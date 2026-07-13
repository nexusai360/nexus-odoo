import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDomainAccess } from "@/lib/reports/guard";
import { getReport } from "@/lib/reports/catalog";
import { resolveReportIcon } from "@/lib/reports/report-icons";
import { parseFilters } from "@/lib/reports/filters";
import { resolverPeriodo, type PeriodoResolvido } from "@/lib/reports/periodo";
import { reportFreshness } from "@/lib/reports/freshness";
import {
  getRelatorioSaldoProduto, getRelatorioValorPorArmazem,
  getRelatorioEntradasSaidas, getRelatorioProdutoParado,
  getRelatorioTopMovimentados, getRelatorioConcentracao,
} from "@/lib/actions/report-data";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { ReportView, type SecaoComDados } from "./report-view";
import type { ReportFilterValues } from "@/lib/reports/types";
import { aquecerCorte } from "@/lib/corte-app";

export const dynamic = "force-dynamic";

/** Mapa id-do-relatório -> query de leitura. */
const QUERIES: Record<
  string,
  (f: ReportFilterValues) => Promise<{ estado: string; dados: unknown }>
> = {
  "saldo-produto": getRelatorioSaldoProduto,
  "valor-armazem": getRelatorioValorPorArmazem,
  "entradas-saidas": getRelatorioEntradasSaidas,
  "produtos-parados": getRelatorioProdutoParado,
  "top-movimentados": getRelatorioTopMovimentados,
  "concentracao": getRelatorioConcentracao,
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function RelatorioPage({ params, searchParams }: PageProps) {
  // A data de inicio das analises precisa estar hidratada ANTES de qualquer consulta.
  const corte = await aquecerCorte();
  const { id } = await params;
  const sp = await searchParams;
  const report = getReport(id);
  if (!report) notFound();

  // Camada 2 do RBAC , redireciona se o usuário não tem o domínio.
  await requireDomainAccess(report.dominio);

  // Id presente no catálogo mas sem query mapeada , 404 explícito em vez de
  // "query is not a function" em runtime (IM-04).
  const query = QUERIES[id];
  if (!query) notFound();

  const freshness = await reportFreshness(prisma, report);

  // Período resolvido uma vez por relatório (só nos relatórios temporais), já grampeado à
  // data de início das análises (o `aquecerCorte` acima deixou o valor fresco em memória).
  const periodo: PeriodoResolvido | null = report.temporal
    ? resolverPeriodo(sp, report.temporal.periodoPadrao, new Date(), corte)
    : null;

  // Piso do calendário personalizado: o mês da DATA DE INÍCIO DAS ANÁLISES.
  // Antes era o mês mais antigo do CACHE (`_min(fatoEstoqueMovimento.mes)`), o que deixava
  // escolher janeiro quando a plataforma só analisa a partir de março: a query grampeava por
  // baixo (o dado saía certo) e a barra continuava anunciando "jan..jul". A janela mostrada
  // tem que ser a janela lida.
  const periodoMin: string | null = periodo ? corte.slice(0, 7) : null;

  // Uma chamada de query por seção; cada seção parseia seus próprios filtros.
  const secoes: SecaoComDados[] = [];
  for (const secao of report.secoes) {
    const filtros = parseFilters(secao, sp);
    if (periodo) {
      filtros.periodoDe = periodo.de ?? undefined;
      filtros.periodoAte = periodo.ate ?? undefined;
    }
    const resultado = await query(filtros);
    secoes.push({
      secao,
      estado: resultado.estado as SecaoComDados["estado"],
      dados: resultado.dados,
    });
  }

  // Opções dos filtros (armazéns/famílias) a partir do fato de saldo.
  const saldos = await prisma.fatoEstoqueSaldo.findMany({
    select: {
      localId: true, localNome: true,
      familiaId: true, familiaNome: true,
    },
  });
  const options = {
    armazens: dedup(saldos, "localId", "localNome"),
    familias: dedup(saldos, "familiaId", "familiaNome"),
  };

  return (
    <PageShell variant="full">
      <Link
        href="/relatorios"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Relatórios
      </Link>
      <PageHeader
        icon={resolveReportIcon(report.icone)}
        title={report.titulo}
        subtitle={report.descricao}
      />
      <ReportView
        report={report}
        secoes={secoes}
        freshness={freshness}
        options={options}
        periodo={periodo}
        periodoMin={periodoMin}
      />
    </PageShell>
  );
}

/** Extrai opções únicas {id, nome} de uma lista de linhas de fato. */
function dedup<T extends Record<string, unknown>>(
  rows: T[],
  idKey: keyof T,
  nomeKey: keyof T,
): { id: number; nome: string }[] {
  const map = new Map<number, string>();
  for (const r of rows) {
    const id = r[idKey];
    const nome = r[nomeKey];
    if (typeof id === "number" && typeof nome === "string") {
      map.set(id, nome);
    }
  }
  return [...map.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
