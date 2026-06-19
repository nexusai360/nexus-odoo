/**
 * Transformacao PURA de linhas (ja lidas do banco) -> UserProfileData.
 *
 * Desacopla a logica do SQL (testavel via jest; o SQL real vive no worker
 * profile-aggregate.ts e e coberto no E2E). Spec 13 (Onda 1, deterministica).
 *
 * Afinidade de breakdown: o "faturamento por empresa" NAO e um arg; e a ESCOLHA da
 * tool `<dom>_<metrica>_por_<dim>` (spike no dado real 2026-06-19). Agrupamos por
 * familia=<metrica>; se uma variante `_por_<dim>` domina, vira preferencia de visao.
 */

import { decayedScore, rankByScore } from "./scoring";
import type { UserProfileData, TopTopic, RecurringQuestion } from "./types";

/** Ocorrencias minimas + share minimo para uma pref de breakdown entrar (volume baixo). */
export const MIN_PREF_OCCURRENCES = 2;
export const MIN_PREF_SHARE = 0.6;

export interface RawTopicRow {
  topic: string;
  count: number;
  lastSeenMs: number;
}
export interface RawToolCallRow {
  toolName: string;
  count: number;
  lastSeenMs: number;
}
export interface RawQuestionRow {
  label: string; // ja normalizado (vocabulario fechado) , ver normalizar-pergunta.ts
  count: number;
  lastSeenMs: number;
}

const DOMAIN_BY_PREFIX: Readonly<Record<string, string>> = {
  fiscal: "fiscal",
  estoque: "estoque",
  financeiro: "financeiro",
  comercial: "comercial",
  cadastro: "cadastros",
  cadastros: "cadastros",
  contabil: "contabil",
};

/** Dominio de negocio derivado do prefixo do nome da tool, ou null. */
export function dominioDaTool(toolName: string): string | null {
  const prefix = toolName.split("_", 1)[0];
  return DOMAIN_BY_PREFIX[prefix] ?? null;
}

/** Parseia `<dom>_<metrica>_por_<dim>` -> { familia: metrica, dim }. null se nao casar. */
function parseBreakdown(toolName: string): { familia: string; dim: string } | null {
  const m = /^[a-z]+_(.+)_por_(.+)$/.exec(toolName);
  if (!m) return null;
  return { familia: m[1], dim: m[2] };
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildProfileFromRows(input: {
  topics: RawTopicRow[];
  toolCalls: RawToolCallRow[];
  questions: RawQuestionRow[];
  nowMs: number;
}): UserProfileData {
  const { topics, toolCalls, questions, nowMs } = input;

  // topTopics
  const scoredTopics: (TopTopic & { _ms: number })[] = topics.map((t) => ({
    topic: t.topic,
    score: decayedScore(t.count, t.lastSeenMs, nowMs),
    lastSeenAt: isoOf(t.lastSeenMs),
    _ms: t.lastSeenMs,
  }));
  const topTopics: TopTopic[] = rankByScore(scoredTopics).map(({ topic, score, lastSeenAt }) => ({
    topic,
    score,
    lastSeenAt,
  }));

  // preferredDomains: dominios com qualquer uso, ranqueados por score decaido somado.
  const domainScore = new Map<string, number>();
  for (const tc of toolCalls) {
    const dom = dominioDaTool(tc.toolName);
    if (!dom) continue;
    domainScore.set(dom, (domainScore.get(dom) ?? 0) + decayedScore(tc.count, tc.lastSeenMs, nowMs));
  }
  const preferredDomains = [...domainScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dom]) => dom);

  // presentationPrefs: afinidade de breakdown por familia de metrica.
  const familyCounts = new Map<string, Map<string, number>>(); // familia -> (dim -> count)
  for (const tc of toolCalls) {
    const bd = parseBreakdown(tc.toolName);
    if (!bd) continue;
    if (!familyCounts.has(bd.familia)) familyCounts.set(bd.familia, new Map());
    const dims = familyCounts.get(bd.familia)!;
    dims.set(bd.dim, (dims.get(bd.dim) ?? 0) + tc.count);
  }
  const presentationPrefs: UserProfileData["presentationPrefs"] = {};
  for (const [familia, dims] of familyCounts) {
    let total = 0;
    let topDim = "";
    let topCount = 0;
    for (const [dim, c] of dims) {
      total += c;
      if (c > topCount) {
        topCount = c;
        topDim = dim;
      }
    }
    if (topCount >= MIN_PREF_OCCURRENCES && total > 0 && topCount / total >= MIN_PREF_SHARE) {
      presentationPrefs[familia] = { breakdownPreferido: topDim };
    }
  }

  // recurringQuestions: agrega por label, decai, rankeia, mantem label/count/lastSeenAt.
  const byLabel = new Map<string, { count: number; lastSeenMs: number }>();
  for (const q of questions) {
    const cur = byLabel.get(q.label);
    if (cur) {
      cur.count += q.count;
      cur.lastSeenMs = Math.max(cur.lastSeenMs, q.lastSeenMs);
    } else {
      byLabel.set(q.label, { count: q.count, lastSeenMs: q.lastSeenMs });
    }
  }
  const scoredQuestions = [...byLabel.entries()].map(([label, v]) => ({
    label,
    count: v.count,
    lastSeenAt: isoOf(v.lastSeenMs),
    score: decayedScore(v.count, v.lastSeenMs, nowMs),
  }));
  const recurringQuestions: RecurringQuestion[] = rankByScore(scoredQuestions).map(
    ({ label, count, lastSeenAt }) => ({ label, count, lastSeenAt }),
  );

  return {
    topTopics,
    topKeywords: [], // Onda 1 deterministica nao deriva keywords (vem da destilacao, Onda 2)
    preferredDomains,
    recurringQuestions,
    presentationPrefs,
  };
}
