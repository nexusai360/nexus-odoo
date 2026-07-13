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

  if (total === 0) {
    return { ids: null, classificacaoIndisponivel: true };
  }

  return {
    ids: locais.map((l) => l.odooId),
    classificacaoIndisponivel: false,
  };
}
