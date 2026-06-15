import type { Candidata, Resolucao } from "./types";
import { scoreFuzzy } from "./_fuzzy";

/** Opcoes ja resolvidas (com defaults aplicados) que o ranking precisa. */
export interface OpcoesRanking {
  topN: number;
  limiarFuzzy: number;
  margemFolga: number;
}

/**
 * Decide unica/ambigua/nenhuma a partir de candidatos pre-filtrados (geralmente por
 * `contains` no banco). Rankeia por scoreFuzzy(ref, nome), ordena desc e:
 * - top abaixo do limiarFuzzy => nenhuma (mesmo com 1 candidato fraco; evita entidade falsa);
 * - top acima do limiar E (unico OU folga >= margemFolga sobre o 2o) => unica;
 * - senao => ambigua (top-N candidatas, ja ordenadas).
 * O chamador pode passar um `score` ja calculado por candidato (ex.: produto penaliza inativo)
 * via `scorePre`; quando ausente, usa scoreFuzzy contra `getNome`.
 */
export function rankearPorNome<T>(
  candidatos: T[],
  ref: string,
  getNome: (c: T) => string,
  opcoes: OpcoesRanking,
  criterio: "documento" | "codigo" | "chave" | "nome" = "nome",
  scorePre?: (c: T) => number,
): Resolucao<T> {
  if (candidatos.length === 0) return { status: "nenhuma" };
  const scored: Candidata<T>[] = candidatos
    .map((c) => ({ entidade: c, score: scorePre ? scorePre(c) : scoreFuzzy(ref, getNome(c)) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (top.score < opcoes.limiarFuzzy) return { status: "nenhuma" };
  const segundo = scored[1];
  if (!segundo || top.score - segundo.score >= opcoes.margemFolga) {
    return { status: "unica", entidade: top.entidade, score: top.score };
  }
  return { status: "ambigua", candidatas: scored.slice(0, opcoes.topN), criterio };
}
