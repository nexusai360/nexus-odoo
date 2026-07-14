import type { PrismaClient } from "@/generated/prisma/client";
import type { ClassificacaoLocal } from "./classificacao-local";

/**
 * Filtro de local para as consultas de estoque.
 *
 * `ids = null` significa NAO FILTRAR. Isso acontece quando `fato_estoque_local` ainda
 * nao foi construido (janela entre o deploy do app, que ja serve as consultas, e o
 * primeiro ciclo do worker, que popula o fato). Devolver uma lista vazia nessa janela
 * zeraria o KPI de estoque em silencio , preferimos mostrar o numero antigo com um
 * aviso a mostrar R$ 0 sem explicacao.
 */
export interface FiltroLocal {
  /** ids dos locais da classificacao, ou `null` para nao filtrar. */
  ids: number[] | null;
  /** true quando o fato de locais ainda nao existe: a tela deve avisar. */
  classificacaoIndisponivel: boolean;
}

/** Aplica o filtro num `where` do Prisma sem quebrar quando ele esta indisponivel. */
export function whereLocal(filtro: FiltroLocal): { localId?: { in: number[] } } {
  return filtro.ids ? { localId: { in: filtro.ids } } : {};
}

/**
 * Escopo de local pedido por quem consulta. E a classificacao mais o "todos", que
 * significa a arvore inteira (fisico + demonstracao + fora), o comportamento antigo.
 * As tools do agente Nex expoem exatamente esses tres valores.
 */
export type EscopoLocal = ClassificacaoLocal | "todos";

/**
 * Where de local para um escopo, pronto para entrar num `where` do Prisma.
 *
 * "todos" nao filtra (a plataforma inteira, como era antes da classificacao existir).
 * Qualquer outro escopo cai no filtro por ids, com o mesmo fail-safe de
 * `localIdsPorClassificacao`: sem o fato de locais construido, nao filtra em vez de
 * zerar o numero.
 */
export async function whereLocalDoEscopo(
  prisma: PrismaClient,
  escopo: EscopoLocal = "fisico",
): Promise<{ localId?: { in: number[] } }> {
  if (escopo === "todos") return {};
  return whereLocal(await localIdsPorClassificacao(prisma, escopo));
}

/**
 * Devolve os ids dos locais de uma classificacao (padrao: o estoque fisico, o que
 * existe dentro de casa).
 */
export async function localIdsPorClassificacao(
  prisma: PrismaClient,
  classificacao: ClassificacaoLocal = "fisico",
): Promise<FiltroLocal> {
  const [total, locais] = await Promise.all([
    prisma.fatoEstoqueLocal.count(),
    prisma.fatoEstoqueLocal.findMany({
      where: { classificacao },
      select: { odooId: true },
    }),
  ]);

  // Fato vazio: o worker ainda nao rodou. Filtrar por lista vazia zeraria o KPI em
  // silencio , preferimos o numero antigo COM aviso.
  if (total === 0) {
    return { ids: null, classificacaoIndisponivel: true };
  }

  // Nenhum deposito fisico, com o fato populado, e anomalia: significa que o Odoo parou de
  // expor os campos que identificam um deposito de verdade, e TODO local virou "fora". O
  // estoque iria a R$ 0 sem explicacao. So vale para o fisico , "nenhum local em
  // demonstracao" e uma resposta legitima (e a tela deve mostrar vazio, nao tudo).
  if (locais.length === 0 && classificacao === "fisico") {
    return { ids: null, classificacaoIndisponivel: true };
  }

  return {
    ids: locais.map((l) => l.odooId),
    classificacaoIndisponivel: false,
  };
}
