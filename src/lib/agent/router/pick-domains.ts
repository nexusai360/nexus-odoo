// R1 router de catalogo: motor de decisao.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §8.
// Funcao publica: `pickDomains(question, settings)`.
// Regras 1-8 aplicadas estritamente em ordem.

import {
  DOMAINS,
  SAUDACOES_STOP_LIST,
  getVocabularyVersion,
} from "./domain-vocabulary";
import { getDomainVectors } from "./embed-domains";
import { embedQuestion } from "./embed-question";
import { normalize } from "./question-normalize";
import type { RouterDecision, RouterSettings } from "./types";

/** Versao maior.menor.patch do codigo do router. Atualizar quando
 *  comportamento mudar de forma significativa (afeta routerVersion no log). */
const ROUTER_CODE_VERSION = "r1.0.0";

const EMBED_TIMEOUT_MS = 3000;
/** Set de tokens individuais derivado das entradas (que podem ser multi-palavra
 *  como "bom dia"). Permite checar pergunta "bom dia obrigado" word-by-word. */
const STOP_TOKENS: ReadonlySet<string> = new Set(
  SAUDACOES_STOP_LIST.flatMap((entry) => entry.split(/\s+/)),
);

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dimensoes incompativeis (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function isTrivial(question: string): boolean {
  const qNorm = normalize(question);
  if (qNorm.length < 10) return true;
  // Todas as palavras estao na stop-list (tokenizada por palavra)?
  const tokens = qNorm.split(/\s+/);
  return tokens.length > 0 && tokens.every((t) => STOP_TOKENS.has(t));
}

/** Embed da pergunta com timeout duro. Retorna `null` em caso de erro. */
async function safeEmbedQuestion(
  question: string,
): Promise<number[] | null> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("embed timeout > 3s")),
        EMBED_TIMEOUT_MS,
      ),
    );
    const result = await Promise.race([embedQuestion(question), timeout]);
    return result.vector;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[router:pick] embed failed", { error: String(err) });
    return null;
  }
}

/** Forma final do RouterDecision com routerVersion preenchido. */
function buildDecision(
  partial: Omit<RouterDecision, "routerVersion">,
): RouterDecision {
  return {
    ...partial,
    routerVersion: `${ROUTER_CODE_VERSION}-${getVocabularyVersion()}`,
  };
}

/** Implementa regras 1-8 do §8 da SPEC v3.
 *  Funcao pura no sentido pratico (efeitos colaterais isolados em embed-* e
 *  console.warn no caminho de falha). */
export async function pickDomains(
  question: string,
  settings: RouterSettings,
): Promise<RouterDecision> {
  const startedAt = Date.now();

  // Regra 1: pergunta trivial -> fallback.
  if (isTrivial(question)) {
    return buildDecision({
      pickedDomains: [],
      scores: {},
      topScore: null,
      fallback: { triggered: true, reason: "msg_trivial" },
      pickDurationMs: Date.now() - startedAt,
    });
  }

  // Regra 2: embedda pergunta (com timeout). Fallback se falhar.
  const qVector = await safeEmbedQuestion(question);
  if (qVector === null) {
    return buildDecision({
      pickedDomains: [],
      scores: {},
      topScore: null,
      fallback: { triggered: true, reason: "embed_failed" },
      pickDurationMs: Date.now() - startedAt,
    });
  }

  // Regra 3: computa scores.
  let domainVectors: Record<string, number[]>;
  try {
    domainVectors = await getDomainVectors();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[router:pick] domain vectors failed", {
      error: String(err),
    });
    return buildDecision({
      pickedDomains: [],
      scores: {},
      topScore: null,
      fallback: { triggered: true, reason: "embed_failed" },
      pickDurationMs: Date.now() - startedAt,
    });
  }

  const scores: Record<string, number> = {};
  for (const d of DOMAINS) {
    const v = domainVectors[d.domain];
    if (v !== undefined) {
      scores[d.domain] = cosineSimilarity(qVector, v);
    }
  }

  // Regra 4: forceIncludeOn (early, antes de top-K).
  const picked = new Set<string>();
  for (const d of DOMAINS) {
    if (!d.forceIncludeOn) continue;
    if (d.forceIncludeOn.some((re) => re.test(question))) {
      picked.add(d.domain);
    }
  }

  // Regra 5: top-K com threshold.
  const ranked = Object.entries(scores)
    .filter(([, s]) => s >= settings.threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, settings.topK);
  for (const [d] of ranked) {
    picked.add(d);
  }

  // Regra 6: fallback se vazio.
  if (picked.size === 0) {
    return buildDecision({
      pickedDomains: [],
      scores,
      topScore: maxOrNull(scores),
      fallback: { triggered: true, reason: "score_baixo" },
      pickDurationMs: Date.now() - startedAt,
    });
  }

  // Regra 7: excludeFromFiltering sempre presentes.
  for (const d of DOMAINS) {
    if (d.excludeFromFiltering) picked.add(d.domain);
  }

  // Regra 8: decisao final.
  return buildDecision({
    pickedDomains: Array.from(picked),
    scores,
    topScore: maxOrNull(scores),
    fallback: { triggered: false },
    pickDurationMs: Date.now() - startedAt,
  });
}

function maxOrNull(scores: Record<string, number>): number | null {
  const values = Object.values(scores);
  if (values.length === 0) return null;
  return Math.max(...values);
}

// Exporta cosineSimilarity para testes diretos.
export { cosineSimilarity };
