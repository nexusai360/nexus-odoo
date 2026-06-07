// mcp/catalog/embedding-text.ts
// F3 (cerebro de orquestracao, onda 3a): texto canonico de embedding por tool.
//
// Por que existe: o retrieval de tool (router/pick-tools.ts) precisa de um texto
// rico por tool para gerar um vetor que rankeia bem. A `descricao` sozinha costuma
// ser um one-liner; as frases-gatilho (TOOL_TRIGGERS) acrescentam o vocabulario
// de negocio com que o usuario realmente pergunta (derivado das perguntas-ouro do
// dossie). Indexado por `tool.id` (a fronteira id->name e tratada no lado do agente).
//
// `examples` do ToolEntry NAO e usado: nao cruza o protocolo MCP e so 9/123 tools
// (todas write) o tem. Decisao registrada na spec F3 secao 4.1.

import type { ToolEntry } from "./types.js";
import { isWriteToolEntry } from "./types.js";
import { TOOL_TRIGGERS } from "./tool-triggers.data.js";

/** Frases-gatilho pt-br por tool.id (curadas por dominio na task 3a.1b a partir
 *  das perguntas-ouro [OK] do dossie). A descricao sozinha ja garante a cobertura
 *  minima, entao tool sem trigger NAO fica invisivel; os triggers elevam o recall@K. */
export { TOOL_TRIGGERS };

/** Texto que alimenta o vetor da tool: descricao + frases-gatilho do id. */
export function embeddingTextFor(tool: Pick<ToolEntry, "id" | "descricao">): string {
  const triggers = TOOL_TRIGGERS[tool.id] ?? [];
  return [tool.descricao, ...triggers].filter(Boolean).join(". ");
}

/** Limite da description publicada em tools/list (vai ao prompt do LLM em cada
 *  turno no modo fallback/shadow). Bound para nao inflar tokens (otimizacao fina
 *  e' F6); o retrieval usa o texto completo via embeddingTextFor no embed-tools. */
export const MAX_DESCRIPTION = 400;

/** Description publicada em tools/list: descricao + ate 3 triggers, capada em
 *  MAX_DESCRIPTION chars cortando no limite de palavra (preserva o 1o trigger
 *  quando couber). Determinista para o teste. */
export function descriptionForRetrieval(tool: Pick<ToolEntry, "id" | "descricao">): string {
  const triggers = (TOOL_TRIGGERS[tool.id] ?? []).slice(0, 3);
  const full = [tool.descricao, ...triggers].filter(Boolean).join(". ");
  if (full.length <= MAX_DESCRIPTION) return full;
  const corte = full.slice(0, MAX_DESCRIPTION);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte).trimEnd();
}

/** Comprimento minimo aceitavel do embeddingText de uma read-tool (piso
 *  anti-trivial). A read-tool mais curta do catalogo hoje tem 32 chars
 *  (financeiro_saldo_contas); as demais >= 45. O gate so pega tool nova com
 *  descricao trivial (evita tool "invisivel"); a qualidade de fato do retrieval
 *  e medida por recall@K no mini-oraculo (V.2), nao por este comprimento. */
export const MIN_EMBEDDING_TEXT = 25;

/** Gate de cobertura: lanca se alguma READ-tool produz embeddingText curto.
 *  Write-tools nao entram no retrieval, entao sao ignoradas. Use no startup/CI. */
export function assertEmbeddingTextCoverage(tools: readonly ToolEntry[]): void {
  const fracas: string[] = [];
  for (const t of tools) {
    if (isWriteToolEntry(t)) continue;
    if (embeddingTextFor(t).length < MIN_EMBEDDING_TEXT) fracas.push(t.id);
  }
  if (fracas.length > 0) {
    throw new Error(
      `[embedding-text] read-tools com embeddingText < ${MIN_EMBEDDING_TEXT} chars ` +
        `(curar descricao ou TOOL_TRIGGERS): ${fracas.join(", ")}`,
    );
  }
}
