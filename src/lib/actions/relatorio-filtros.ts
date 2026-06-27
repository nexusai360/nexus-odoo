"use server";

// src/lib/actions/relatorio-filtros.ts
// F6 , re-resolve um relatorio salvo aplicando filtros de runtime (barra de
// filtros da UI). Respeita a mesma visibilidade de consumo do carregamento.
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { carregarRelatorioDinamico } from "@/lib/reports/builder/carregar-relatorio-dinamico";
import {
  extrairDimensoes,
  type DimensoesFiltro,
} from "@/lib/reports/builder/dimensoes-filtro";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

export interface FiltrosRuntime {
  marca?: string;
  faixaDias?: number;
  sentido?: string;
  /** Id do armazem (localId) escolhido no dropdown. */
  armazemId?: number;
  /** Id da familia (familiaId) escolhida no dropdown. */
  familiaId?: number;
}

export async function resolverRelatorioComFiltros(
  savedId: string,
  filtros: FiltrosRuntime,
): Promise<{ ok: true; dados: Record<string, SecaoResolvida> } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Nao autenticado" };
  const limpos: FiltrosRuntime = {};
  if (filtros.marca && filtros.marca.trim()) limpos.marca = filtros.marca.trim();
  if (typeof filtros.faixaDias === "number" && filtros.faixaDias > 0) limpos.faixaDias = filtros.faixaDias;
  if (filtros.sentido && filtros.sentido.trim()) limpos.sentido = filtros.sentido.trim();
  if (typeof filtros.armazemId === "number" && filtros.armazemId > 0) limpos.armazemId = filtros.armazemId;
  if (typeof filtros.familiaId === "number" && filtros.familiaId > 0) limpos.familiaId = filtros.familiaId;

  const r = await carregarRelatorioDinamico(savedId, { userId: me.id, role: me.platformRole }, limpos);
  if (r.tipo === "notfound") return { ok: false, error: "Relatorio nao encontrado" };
  if (r.tipo === "invalida") return { ok: false, error: "Relatorio invalido" };
  return { ok: true, dados: r.dados };
}

/**
 * Lista as dimensoes filtraveis (armazem/familia) com seus ids, derivadas do
 * fato de saldo. Alimenta os dropdowns da barra de filtros: o label e o nome,
 * o value e o id que viaja como `armazemId`/`familiaId`.
 */
export async function listarDimensoesFiltro(): Promise<DimensoesFiltro> {
  const me = await getCurrentUser();
  if (!me) return { armazens: [], familias: [] };
  const linhas = await prisma.fatoEstoqueSaldo.findMany({
    select: { localId: true, localNome: true, familiaId: true, familiaNome: true },
  });
  return extrairDimensoes(linhas);
}
