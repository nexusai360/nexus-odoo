import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, Resolver, ResolverOpcoes } from "./types";
import { rankearPorNome } from "./_ranking";

/**
 * Conta contabil do plano de contas da EMPRESA (model FatoContaContabil).
 * Distinta da conta referencial SPED (FatoContabilContaReferencial). Os campos
 * abaixo sao o subset projetado em todo ramo (nunca carregamos a linha inteira).
 */
export interface ContaContabil {
  odooId: number;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string | null;
}

/** Defaults conservadores do resolvedor (plano F2, secao Conta Contabil). */
export const DEFAULTS_CONTA = { topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 } as const;

// Colunas projetadas em todos os ramos. codigo nao indexado: cardinalidade 934,
// o ramo codigo-sem-pontos carrega por startsWith do primeiro digito (carga por
// prefixo justificada, igual armazem/centro), nunca findMany cego de tabela inteira.
const SELECT = { odooId: true, codigo: true, nome: true, tipo: true, natureza: true } as const;

type Row = { odooId: number; codigo: string; nome: string; tipo: string; natureza: string | null };

function proj(r: Row): ContaContabil {
  return { odooId: r.odooId, codigo: r.codigo, nome: r.nome, tipo: r.tipo, natureza: r.natureza };
}

/** Filtros opcionais (natureza/tipo) viram where adicional, aplicado em todo ramo. */
function buildFiltros(filtros?: Record<string, unknown>): { natureza?: string; tipo?: string } {
  const w: { natureza?: string; tipo?: string } = {};
  if (filtros && typeof filtros.natureza === "string") w.natureza = filtros.natureza;
  if (filtros && typeof filtros.tipo === "string") w.tipo = filtros.tipo;
  return w;
}

/**
 * Resolve uma referencia textual para uma conta contabil do plano da empresa.
 * Ramos (spec 3.3/5, ordem fixa, invariante "nunca entidade falsa"):
 *   id (`^\d{1,9}$`) => findUnique; se nao achou, segue.
 *   codigo COM pontos => where codigo exato (igualdade, nunca contains).
 *   codigo SO digitos => carrega por prefixo do 1o digito e compara
 *       cand.codigo.replace(/\./g,"") === ref por IGUALDADE (anti-falso-positivo:
 *       "110101" jamais casa "1.1.01.011", cujos digits sao "11010101").
 *   nome => contains insensitive + scoreFuzzy (limiar 0.75, folga 0.1, top 3).
 * Filtros natureza/tipo entram como where adicional em todo ramo de banco.
 */
export const resolverContaContabil: Resolver<ContaContabil> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<ContaContabil>> => {
  const r = ref.trim();
  const filtroWhere = buildFiltros(opcoes?.filtros);
  const topN = opcoes?.topN ?? DEFAULTS_CONTA.topN;
  const limiarFuzzy = opcoes?.limiarFuzzy ?? DEFAULTS_CONTA.limiarFuzzy;
  const margemFolga = opcoes?.margemFolga ?? DEFAULTS_CONTA.margemFolga;

  // Ramo id: so quando nao ha filtros estruturais (findUnique nao aceita where extra).
  if (/^\d{1,9}$/.test(r) && Object.keys(filtroWhere).length === 0) {
    const found = await prisma.fatoContaContabil.findUnique({ where: { odooId: Number(r) } });
    if (found) return { status: "unica", entidade: proj(found as Row), score: 1 };
    // nao achou por id: pode ser codigo-sem-pontos ou nome; segue.
  }

  // Ramo codigo COM pontos: igualdade exata.
  if (r.includes(".")) {
    const candidatos = (await prisma.fatoContaContabil.findMany({
      where: { codigo: r, ...filtroWhere },
      select: SELECT,
    })) as Row[];
    if (candidatos.length === 1) return { status: "unica", entidade: proj(candidatos[0]), score: 1 };
    if (candidatos.length === 0) return { status: "nenhuma" };
    // empate exato de codigo (nao esperado, codigo e unico): devolve candidatas, criterio codigo.
    return { status: "ambigua", candidatas: candidatos.slice(0, topN).map((c) => ({ entidade: proj(c), score: 1 })), criterio: "codigo" };
  }

  // Ramo codigo SO digitos (forma "sem pontos"): carga por prefixo do 1o digito,
  // comparacao por IGUALDADE de digits em JS (nunca contains). Anti-falso-positivo.
  if (/^\d+$/.test(r)) {
    const candidatos = (await prisma.fatoContaContabil.findMany({
      where: { codigo: { startsWith: r[0] }, ...filtroWhere },
      select: SELECT,
    })) as Row[];
    const exatos = candidatos.filter((c) => c.codigo.replace(/\./g, "") === r);
    if (exatos.length === 1) return { status: "unica", entidade: proj(exatos[0]), score: 1 };
    if (exatos.length === 0) return { status: "nenhuma" };
    return { status: "ambigua", candidatas: exatos.slice(0, topN).map((c) => ({ entidade: proj(c), score: 1 })), criterio: "codigo" };
  }

  // Ramo nome: contains insensitive + scoreFuzzy (limiar/folga/top-N).
  const porNome = (await prisma.fatoContaContabil.findMany({
    where: { nome: { contains: r, mode: "insensitive" }, ...filtroWhere },
    select: SELECT,
  })) as Row[];
  const ranked = rankearPorNome(
    porNome,
    r,
    (c) => c.nome,
    { topN, limiarFuzzy, margemFolga },
    "nome",
  );
  if (ranked.status === "nenhuma") return ranked;
  if (ranked.status === "unica") return { status: "unica", entidade: proj(ranked.entidade), score: ranked.score };
  return {
    status: "ambigua",
    candidatas: ranked.candidatas.map((c) => ({ entidade: proj(c.entidade), score: c.score })),
    criterio: "nome",
  };
};
