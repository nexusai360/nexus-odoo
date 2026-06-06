// Resolvedor de entidade "produto" (Fase 2 do Nex, Bloco B do plano).
// Fonte = FatoProduto. Ordem dos ramos (spec 3.3/5): classificarRef -> id ->
// codigoUnico/codigoBarras (EAN) exato -> codigo interno exato -> nome fuzzy.
// Nunca devolve entidade falsa: na duvida "ambigua" (top-N) ou "nenhuma".
// Sempre filtra no banco (where), nunca findMany cego.

import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";
import { rankearPorNome, type OpcoesRanking } from "./_ranking";
import { scoreFuzzy as scoreNome } from "./_fuzzy";

/** Defaults conservadores do resolvedor de produto. */
export const DEFAULTS_PRODUTO = { topN: 5, limiarFuzzy: 0.8, margemFolga: 0.1 } as const;

/** Entidade canonica de produto exposta nas candidatas (shape estavel para a Fase 3). */
export interface ProdutoEntidade {
  odooId: number;
  nome: string;
  codigo: string | null;
  codigoUnico: string | null;
  marcaNome: string | null;
  familiaNome: string | null;
  ativo: boolean;
}

// Colunas minimas que todo ramo seleciona (evita findMany/findFirst cego).
const SELECT = {
  odooId: true,
  nome: true,
  codigo: true,
  codigoUnico: true,
  codigoBarras: true,
  marcaNome: true,
  familiaNome: true,
  ativo: true,
} as const;

type Row = {
  odooId: number;
  nome: string;
  codigo: string | null;
  codigoUnico: string | null;
  codigoBarras: string | null;
  marcaNome: string | null;
  familiaNome: string | null;
  ativo: boolean;
};

function proj(r: Row): ProdutoEntidade {
  return {
    odooId: r.odooId,
    nome: r.nome,
    codigo: r.codigo,
    codigoUnico: r.codigoUnico,
    marcaNome: r.marcaNome,
    familiaNome: r.familiaNome,
    ativo: r.ativo,
  };
}

/**
 * Resolve uma referencia textual (id, EAN/codigo de barras, codigo interno ou nome)
 * para um produto do catalogo. CS4: codigo numerico longo que nao casa exato retorna
 * "nenhuma" SEM cair no fuzzy de nome (defesa contra entidade falsa por substring).
 */
export async function resolverProduto(
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<ProdutoEntidade>> {
  const r = ref.trim();
  const tipo = classificarRef(r);
  const filtros = (opcoes?.filtros ?? {}) as { familiaId?: number; marcaId?: number };
  const filtrosWhere: { familiaId?: number; marcaId?: number } = {};
  if (typeof filtros.familiaId === "number") filtrosWhere.familiaId = filtros.familiaId;
  if (typeof filtros.marcaId === "number") filtrosWhere.marcaId = filtros.marcaId;

  // Ramo id (odooId Int, ate 9 digitos).
  if (tipo === "id") {
    const found = (await prisma.fatoProduto.findUnique({
      where: { odooId: Number(r) },
      select: SELECT,
    })) as Row | null;
    if (found) return { status: "unica", entidade: proj(found), score: 1 };
    // id inexistente: tenta codigo interno exato antes de desistir.
    const porCodigo = (await prisma.fatoProduto.findFirst({
      where: { codigo: r, ...filtrosWhere },
      select: SELECT,
    })) as Row | null;
    if (porCodigo) return { status: "unica", entidade: proj(porCodigo), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo codigo numerico longo (EAN/GTIN): codigoUnico OU codigoBarras exato.
  // CS4: se nao casar exato, retorna nenhuma SEM fuzzy de nome.
  if (tipo === "codigo_numerico_longo" || tipo === "documento") {
    const porCodigoLongo = (await prisma.fatoProduto.findFirst({
      where: { OR: [{ codigoUnico: r }, { codigoBarras: r }], ...filtrosWhere },
      select: SELECT,
    })) as Row | null;
    if (porCodigoLongo) return { status: "unica", entidade: proj(porCodigoLongo), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo nome fuzzy (texto). Pre-filtra por `contains` (nunca findMany cego),
  // depois rankeia com scoreFuzzy. Inativo aparece, mas penalizado e por ultimo.
  const candidatos = (await prisma.fatoProduto.findMany({
    where: { nome: { contains: r, mode: "insensitive" }, ...filtrosWhere },
    select: SELECT,
  })) as Row[];

  const ranking: OpcoesRanking = {
    topN: opcoes?.topN ?? DEFAULTS_PRODUTO.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_PRODUTO.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_PRODUTO.margemFolga,
  };

  const entidades = candidatos.map(proj);
  return rankearPorNome<ProdutoEntidade>(
    entidades,
    r,
    (c) => c.nome,
    ranking,
    "nome",
    // score penaliza inativo (*0.9) sem esconder, jogando-o para o fim do ranking.
    (c) => {
      const base = scoreNome(r, c.nome);
      return c.ativo ? base : base * 0.9;
    },
  );
}
