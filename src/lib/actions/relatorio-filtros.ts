"use server";

// src/lib/actions/relatorio-filtros.ts
// F6 , re-resolve um relatorio salvo aplicando filtros de runtime (barra de
// filtros da UI). Respeita a mesma visibilidade de consumo do carregamento.
import { getCurrentUser } from "@/lib/auth";
import { carregarRelatorioDinamico } from "@/lib/reports/builder/carregar-relatorio-dinamico";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

export interface FiltrosRuntime {
  marca?: string;
  faixaDias?: number;
  sentido?: string;
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

  const r = await carregarRelatorioDinamico(savedId, { userId: me.id, role: me.platformRole }, limpos);
  if (r.tipo === "notfound") return { ok: false, error: "Relatorio nao encontrado" };
  if (r.tipo === "invalida") return { ok: false, error: "Relatorio invalido" };
  return { ok: true, dados: r.dados };
}
