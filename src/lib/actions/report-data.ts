"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getMyDomains } from "@/lib/actions/domain-access";
import { reportFreshness } from "@/lib/reports/freshness";
import { getReport } from "@/lib/reports/catalog";
import type { ReportFilterValues, ReportResult, ReportState } from "@/lib/reports/types";

/** Linha de R1. */
export interface SaldoProdutoRow {
  produtoNome: string | null;
  localNome: string | null;
  familiaNome: string | null;
  quantidade: number | null;
  unidade: string | null;
}
/** Barra de R2. */
export interface ValorArmazemBar {
  rotulo: string;
  valor: number;
}

/**
 * Resolve o estado do fato: 'preparando' se o builder nunca rodou;
 * caso contrário 'ok'. 'vazio'/'erro' são decididos pela função-chamadora.
 */
async function estadoDoFato(fato: string): Promise<"preparando" | "ok"> {
  const build = await prisma.fatoBuildState.findUnique({ where: { fato } });
  return build ? "ok" : "preparando";
}

/** Guard comum: exige auth + domínio estoque (camada 3 do RBAC). */
async function guardEstoque(): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Não autenticado");
  const mine = await getMyDomains();
  if (!mine.includes("estoque")) throw new Error("Sem acesso ao domínio");
}

/** R1 — Saldo por produto e armazém. */
export async function getRelatorioSaldoProduto(
  filtros: ReportFilterValues,
): Promise<ReportResult<SaldoProdutoRow[]>> {
  const entry = getReport("saldo-produto")!;
  try {
    await guardEstoque();
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const rows = await prisma.fatoEstoqueSaldo.findMany({
      where: {
        ...(filtros.produtoId ? { produtoId: filtros.produtoId } : {}),
        ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
        ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
        ...(filtros.busca
          ? { produtoNome: { contains: filtros.busca, mode: "insensitive" } }
          : {}),
      },
      select: {
        produtoNome: true, localNome: true, familiaNome: true,
        quantidade: true, unidade: true,
      },
      orderBy: { produtoNome: "asc" },
    });
    const dados: SaldoProdutoRow[] = rows.map((r) => ({
      produtoNome: r.produtoNome,
      localNome: r.localNome,
      familiaNome: r.familiaNome,
      quantidade: r.quantidade ? Number(r.quantidade) : null,
      unidade: r.unidade,
    }));
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}

/** R2 — Valor de estoque por armazém. */
export async function getRelatorioValorPorArmazem(
  _filtros: ReportFilterValues,
): Promise<ReportResult<ValorArmazemBar[]>> {
  const entry = getReport("valor-armazem")!;
  try {
    await guardEstoque();
    const freshness = await reportFreshness(prisma, entry);
    const base = await estadoDoFato("fato_estoque_saldo");
    if (base === "preparando") {
      return { estado: "preparando", dados: [], freshness };
    }
    const grupos = await prisma.fatoEstoqueSaldo.groupBy({
      by: ["localNome"],
      where: { vrSaldo: { gt: 0 } },
      _sum: { vrSaldo: true },
    });
    const dados: ValorArmazemBar[] = grupos.map((g) => ({
      rotulo: g.localNome ?? "Sem armazém",
      valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
    }));
    const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
    return { estado, dados, freshness };
  } catch {
    return { estado: "erro", dados: [], freshness: null };
  }
}
