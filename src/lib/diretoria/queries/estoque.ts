// Queries de Estoque & Compras (módulo A do HTML) próprias da Diretoria. Estoque
// agrega fato_estoque_saldo; compras (A8) agregam fato_dfe (notas de entrada).

import type { PrismaClient } from "@/generated/prisma/client";

export interface IndicadoresEstoque {
  valorTotal: number;
  itens: number;
  produtos: number;
  locais: number;
}

/** A4 , Indicadores do estoque (valor total, itens, produtos e locais distintos). */
export async function queryIndicadoresEstoque(
  prisma: PrismaClient,
): Promise<IndicadoresEstoque> {
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    select: { quantidade: true, vrSaldo: true, produtoId: true, localId: true },
  });
  let valorTotal = 0;
  let itens = 0;
  const produtos = new Set<number>();
  const locais = new Set<number>();
  for (const r of rows) {
    valorTotal += Number(r.vrSaldo ?? 0);
    itens += Number(r.quantidade ?? 0);
    if (r.produtoId != null) produtos.add(r.produtoId);
    if (r.localId != null) locais.add(r.localId);
  }
  return { valorTotal, itens, produtos: produtos.size, locais: locais.size };
}

export interface LinhaAgrupada {
  chave: string;
  quantidade: number;
  valorTotal: number;
}

async function agrupaSaldo(
  prisma: PrismaClient,
  campo: "localNome" | "familiaNome" | "marcaNome",
  semNome: string,
): Promise<{ linhas: LinhaAgrupada[]; valorGeral: number }> {
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    select: { [campo]: true, quantidade: true, vrSaldo: true },
  });
  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const chave = (r as Record<string, unknown>)[campo] as string | null;
    const k = chave ?? semNome;
    const v = Number(r.vrSaldo ?? 0);
    const cur = map.get(k);
    if (cur) {
      cur.quantidade += Number(r.quantidade ?? 0);
      cur.valorTotal += v;
    } else {
      map.set(k, { quantidade: Number(r.quantidade ?? 0), valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.entries()]
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.chave.localeCompare(b.chave));
  return { linhas, valorGeral };
}

/** A2 , Estoque por local (valor por armazém/local). */
export function queryEstoquePorLocal(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "localNome", "Sem local");
}

/** A5 , Distribuição do estoque por família. */
export function queryEstoquePorFamilia(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "familiaNome", "Sem família");
}

/** A5 , Distribuição do estoque por marca. */
export function queryEstoquePorMarca(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "marcaNome", "Sem marca");
}

export interface CompraFornecedor {
  fornecedor: string;
  notas: number;
  valorTotal: number;
}

/** A8 , Compras por fornecedor (notas fiscais de entrada do período). */
export async function queryComprasPorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<{ linhas: CompraFornecedor[]; valorGeral: number }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00Z`),
            lte: new Date(`${filtros.periodoAte}T23:59:59Z`),
          },
        }
      : {};
  const rows = await prisma.fatoDfe.findMany({
    where,
    select: { fornecedorNome: true, vrNf: true },
  });
  const map = new Map<string, { notas: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const k = r.fornecedorNome ?? "Não informado";
    const v = Number(r.vrNf ?? 0);
    const cur = map.get(k);
    if (cur) {
      cur.notas += 1;
      cur.valorTotal += v;
    } else {
      map.set(k, { notas: 1, valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.entries()]
    .map(([fornecedor, v]) => ({ fornecedor, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.fornecedor.localeCompare(b.fornecedor));
  return { linhas, valorGeral };
}
