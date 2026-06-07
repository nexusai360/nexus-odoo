// F3 (cerebro, onda 3a): retrieval de tool individual por embedding.
//
// Dado o vetor da pergunta e os vetores das tools (embed-tools.ts), rankeia por
// cosseno e devolve o catalogo enxuto = NUCLEO MINIMO + top-K cross-dominio.
//
// Nucleo minimo (piso de seguranca): toda tool cujo dominio esta nos
// pickedDomains do router, ou nos dominios excludeFromFiltering (transversal,
// dominios-vazios, caminho3), ou nao-mapeado (_desconhecido, inclui tools
// externas) entra SEMPRE , independe de cosseno. Assim a tool certa nunca some
// por ruido de embedding ou falta de curadoria. O top-K so ADICIONA candidatas
// de outros dominios. RBAC ja foi aplicado antes (filter-catalog camada B).

import { EXCLUDE_FROM_FILTERING } from "./filter-catalog";
import { UNKNOWN_DOMAIN, getToolDomain } from "./tool-to-domain";
import type { RetrievalTool, ToolRetrievalResult } from "./types";

function cosseno(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type PickToolsInput = {
  tools: readonly RetrievalTool[];
  toolVectors: Record<string, number[]>;
  /** Vetor da pergunta. null => fallback (retorna todas). */
  questionVector: readonly number[] | null;
  /** Dominios escolhidos pelo router (entram inteiros no nucleo). */
  pickedDomains: readonly string[];
  /** Quantas candidatas cross-dominio (fora do nucleo) o top-K adiciona. */
  k: number;
};

/** Decide se o dominio da tool entra no nucleo minimo (piso). */
function noNucleo(name: string, picked: ReadonlySet<string>): boolean {
  const dom = getToolDomain(name);
  return picked.has(dom) || EXCLUDE_FROM_FILTERING.has(dom) || dom === UNKNOWN_DOMAIN;
}

export function pickTools(input: PickToolsInput): ToolRetrievalResult {
  const { tools, toolVectors, questionVector, pickedDomains, k } = input;
  const nomes = tools.map((t) => t.name);

  // Fallback: sem vetor da pergunta, devolve tudo (comportamento atual).
  if (!questionVector) {
    return { picked: [...nomes], scores: {}, floorAdded: [] };
  }

  const pickedSet = new Set(pickedDomains);
  const scores: Record<string, number> = {};
  for (const t of tools) {
    const v = toolVectors[t.name];
    scores[t.name] = v ? cosseno(questionVector, v) : 0;
  }

  const floor = new Set(nomes.filter((n) => noNucleo(n, pickedSet)));

  // top-K entre as NAO-floor, por cosseno desc.
  const candidatas = nomes
    .filter((n) => !floor.has(n))
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    .slice(0, Math.max(0, k));

  const picked = [...new Set([...floor, ...candidatas])];
  const topKSet = new Set(candidatas);
  const floorAdded = [...floor].filter((n) => !topKSet.has(n));

  return { picked, scores, floorAdded };
}
