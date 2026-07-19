// src/worker/fatos/fato-lista-material.ts
// FONTE: raw_sped_produto_lista_material_item (a Lista de Material / BOM do Odoo).
// Uma linha por COMPONENTE de um kit. Usado para desmembrar a demanda de kits em componentes
// (análise de compra). Ligação pelo PAI direto: produto_pai_id = produto_produzido_id[0] do item
// (casa 1:1 com o cabeçalho; recupera kits sem lista_material_id preenchido). Guardamos TODOS os
// tipos de item (P e PRD-R são peças reais, medido); quem filtrar decide na consulta.
// FILTRO: raw_deleted=false. Decisão: truncate + insert (raw é fonte única, ~475 linhas).

import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

/** id de M2O Odoo `[id, "nome"]` ou null. */
function relId(m2o: unknown): number | null {
  if (!Array.isArray(m2o) || m2o.length < 1) return null;
  const id = m2o[0];
  return typeof id === "number" ? id : null;
}
function relNome(m2o: unknown): string | null {
  if (!Array.isArray(m2o) || m2o.length < 2) return null;
  const v = m2o[1];
  return typeof v === "string" && v.length > 0 ? v : null;
}
/** Número defensivo: Odoo retorna `false` para nulos. */
function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export interface FatoListaMaterialItemRow {
  produtoPaiId: number;
  componenteProdutoId: number;
  componenteNome: string | null;
  quantidade: number;
  tipoItem: string | null;
  listaId: number | null;
  listaDataAtivacao: Date | null;
  listaInativa: boolean;
}

/** Ativacao de uma lista (header). null/false do Odoo viram null/nao-inativa. */
export interface AtivacaoLista {
  dataAtivacao: Date | null;
  inativa: boolean;
}

function parseDataOdoo(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null; // Odoo manda `false` (bool) p/ vazio
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Mapeia uma linha da BOM. Retorna null quando não há pai ou componente (linha inútil).
 * `ativacaoPorLista` (do header raw_sped_produto_lista_material) traz a ativação da lista.
 */
export function mapListaMaterialRow(
  raw: Record<string, unknown>,
  ativacaoPorLista?: Map<number, AtivacaoLista>,
): FatoListaMaterialItemRow | null {
  const pai = relId(raw.produto_produzido_id);
  const comp = relId(raw.produto_id);
  if (pai == null || comp == null) return null;
  const listaId = relId(raw.lista_id);
  const ativ = listaId != null ? ativacaoPorLista?.get(listaId) : undefined;
  return {
    produtoPaiId: pai,
    componenteProdutoId: comp,
    componenteNome: relNome(raw.produto_id),
    quantidade: toNum(raw.quantidade),
    tipoItem: typeof raw.tipo_item === "string" ? raw.tipo_item : null,
    listaId,
    listaDataAtivacao: ativ?.dataAtivacao ?? null,
    listaInativa: ativ?.inativa ?? false,
  };
}

export async function rebuildFatoListaMaterial(prisma: PrismaClient): Promise<number> {
  // Header das listas (raw_sped_produto_lista_material): ativacao por lista (odoo_id).
  const headers = await prisma.$queryRaw<{ data: Record<string, unknown> }[]>`
    SELECT data FROM raw_sped_produto_lista_material WHERE raw_deleted = false`;
  const ativacaoPorLista = new Map<number, AtivacaoLista>();
  for (const h of headers) {
    const id = Number(h.data.id);
    if (!Number.isFinite(id)) continue;
    ativacaoPorLista.set(id, {
      dataAtivacao: parseDataOdoo(h.data.data_ativacao),
      inativa: parseDataOdoo(h.data.data_inativacao) != null,
    });
  }

  const rawRows = await prisma.$queryRaw<{ data: Record<string, unknown> }[]>`
    SELECT data FROM raw_sped_produto_lista_material_item WHERE raw_deleted = false`;
  const mapped = rawRows
    .map((r) => mapListaMaterialRow(r.data, ativacaoPorLista))
    .filter((r): r is FatoListaMaterialItemRow => r != null);

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoListaMaterialItem.deleteMany({});
      if (mapped.length) {
        await tx.fatoListaMaterialItem.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_lista_material_item");
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  return mapped.length;
}
