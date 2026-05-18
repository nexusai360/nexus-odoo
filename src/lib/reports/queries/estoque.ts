// src/lib/reports/queries/estoque.ts
//
// Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`,
// sem shaping de gráfico**. **Não captura exceção** (deixa propagar — quem
// trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper
// `report-data.ts`, não aqui.
//
// O módulo **importa** `limparNomeLocal` de `@/lib/reports/local-nome` e a usa
// nas agregações que precisam de rótulo de local — `limparNomeLocal` permanece
// em seu módulo atual, não é movida. O que **não vai** para o núcleo:
// `agruparTopN` (report-data.ts, função local) e as constantes `TOP_N`/
// `TOP_CONCENTRACAO` — são shaping de gráfico e permanecem no wrapper.

import type { PrismaClient } from "@/generated/prisma/client";
import { limparNomeLocal } from "@/lib/reports/local-nome";

// ---------------------------------------------------------------------------
// Tipos de R1 — Saldo por produto
// ---------------------------------------------------------------------------

/** Item do detalhamento por local de um produto (para o drill-down). */
export interface DetalhePorLocal {
  localRotulo: string;
  saldo: number;
  valor: number;
}

/** Linha agregada de R1 (por produto). */
export interface SaldoProdutoRow {
  produtoNome: string;
  familiaNome: string | null;
  marcaNome: string | null;
  saldoTotal: number;
  valorTotal: number;
  numLocais: number;
  /** Saldo do produto quebrado por local, com rótulo limpo. */
  detalhePorLocal: DetalhePorLocal[];
}

/** KPIs de topo de R1. */
export interface SaldoProdutoKpis {
  totalProdutos: number;
  produtosNegativos: number;
  valorTotal: number;
}

/** Retorno completo de R1. */
export interface SaldoProdutoData {
  kpis: SaldoProdutoKpis;
  linhas: SaldoProdutoRow[];
}

// ---------------------------------------------------------------------------
// R1 — querySaldoProduto
// ---------------------------------------------------------------------------

/**
 * Agrega saldo de estoque por produto.
 * Fato: fato_estoque_saldo.
 * Não captura exceção — deixa propagar para o wrapper.
 */
export async function querySaldoProduto(
  prisma: PrismaClient,
  filtros: { armazemId?: number; familiaId?: number },
): Promise<SaldoProdutoData> {
  // groupBy não suporta _count(distinct), então buscamos os dados brutos e
  // agregamos em JS — dataset cabe confortavelmente em memória.
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
      ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
    },
    select: {
      produtoId: true,
      produtoNome: true,
      familiaNome: true,
      marcaNome: true,
      localId: true,
      localNome: true,
      quantidade: true,
      vrSaldo: true,
    },
  });

  // Agrega por produtoId
  const mapa = new Map<
    number,
    {
      produtoNome: string;
      familiaNome: string | null;
      marcaNome: string | null;
      saldoTotal: number;
      valorTotal: number;
      locais: Set<number>;
      detalheMap: Map<string, { saldo: number; valor: number }>;
    }
  >();

  for (const r of rows) {
    // Ignora linhas sem produtoId (dados incompletos do Odoo)
    if (r.produtoId == null) continue;
    const pid = r.produtoId;
    const qty = r.quantidade ? Number(r.quantidade) : 0;
    const vr = r.vrSaldo ? Number(r.vrSaldo) : 0;
    const rotulo = r.localNome
      ? limparNomeLocal(r.localNome).rotulo
      : "Sem local";

    const existing = mapa.get(pid);
    if (existing) {
      existing.saldoTotal += qty;
      existing.valorTotal += vr;
      if (r.localId != null) existing.locais.add(r.localId);
      const prev = existing.detalheMap.get(rotulo) ?? { saldo: 0, valor: 0 };
      existing.detalheMap.set(rotulo, {
        saldo: prev.saldo + qty,
        valor: prev.valor + vr,
      });
    } else {
      const detalheMap = new Map<string, { saldo: number; valor: number }>();
      detalheMap.set(rotulo, { saldo: qty, valor: vr });
      mapa.set(pid, {
        produtoNome: r.produtoNome ?? "",
        familiaNome: r.familiaNome,
        marcaNome: r.marcaNome,
        saldoTotal: qty,
        valorTotal: vr,
        locais: r.localId != null ? new Set([r.localId]) : new Set(),
        detalheMap,
      });
    }
  }

  const linhas: SaldoProdutoRow[] = [...mapa.values()]
    .map((v) => ({
      produtoNome: v.produtoNome,
      familiaNome: v.familiaNome,
      marcaNome: v.marcaNome,
      saldoTotal: v.saldoTotal,
      valorTotal: v.valorTotal,
      numLocais: v.locais.size,
      detalhePorLocal: [...v.detalheMap.entries()]
        .map(([localRotulo, d]) => ({
          localRotulo,
          saldo: d.saldo,
          valor: d.valor,
        }))
        .sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal);

  const totalProdutos = linhas.length;
  const produtosNegativos = linhas.filter((l) => l.saldoTotal < 0).length;
  const valorTotal = linhas.reduce((acc, l) => acc + l.valorTotal, 0);

  return {
    kpis: { totalProdutos, produtosNegativos, valorTotal },
    linhas,
  };
}
