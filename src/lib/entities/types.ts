import type { PrismaClient } from "../../generated/prisma/client";

/** Opcoes de resolucao de entidade (todas opcionais; defaults conservadores no resolvedor). */
export interface ResolverOpcoes {
  topN?: number;
  limiarFuzzy?: number;
  margemFolga?: number;
  filtros?: Record<string, unknown>;
}

/** Candidata de uma resolucao ambigua. score 1 = exato; < 1 = fuzzy. */
export interface Candidata<T> {
  entidade: T;
  score: number;
}

/**
 * Resultado discriminado de resolver uma referencia textual para uma entidade canonica.
 * Nunca retorna entidade falsa: na duvida, "ambigua" (com candidatas top-N) ou "nenhuma".
 */
export type Resolucao<T> =
  | { status: "unica"; entidade: T; score: number }
  | { status: "ambigua"; candidatas: Candidata<T>[]; criterio: "documento" | "codigo" | "chave" | "nome" }
  | { status: "nenhuma" };

/** Assinatura unica de todo resolvedor de entidade. */
export type Resolver<T> = (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
) => Promise<Resolucao<T>>;
