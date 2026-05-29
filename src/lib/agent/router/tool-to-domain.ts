// R1 router de catalogo: deriva o dominio canonico de uma tool MCP.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §4.3.
// Regra em ordem:
//  1. Override explicito em TOOL_TO_DOMAIN_OVERRIDE (caso especial).
//  2. Primeiro segmento antes do primeiro `_` (ex: `fiscal_X` -> `fiscal`).
//  3. Se o resultado nao bate com KNOWN_DOMAINS, retorna `"_desconhecido"`.
//     filter-catalog trata `_desconhecido` como "manter no catalogo"
//     (fallback conservador).

import { KNOWN_DOMAINS } from "./domain-vocabulary";

/** Marcador retornado quando nao se conseguiu mapear a tool a um dominio
 *  conhecido. filter-catalog mantem essas tools no catalogo por seguranca. */
export const UNKNOWN_DOMAIN = "_desconhecido";

/** Excecoes explicitas: nome da tool nao casa com a regra do prefixo. Vazio
 *  inicialmente; popular quando aparecer tool nao-prefixada (ex: tools de
 *  `mcp/tools/caminho3/` que comecam com `bi_`). */
export const TOOL_TO_DOMAIN_OVERRIDE: Readonly<Record<string, string>> = {
  // exemplo (descomentar quando relevante):
  // "bi_consulta_avancada": "caminho3",
};

/** Retorna o dominio canonico da tool, ou UNKNOWN_DOMAIN se nao reconhecido. */
export function getToolDomain(toolName: string): string {
  // Regra 1: override explicito.
  if (toolName in TOOL_TO_DOMAIN_OVERRIDE) {
    return TOOL_TO_DOMAIN_OVERRIDE[toolName]!;
  }
  // Regra 2: prefixo antes do primeiro `_`.
  const prefix = toolName.split("_")[0] ?? "";
  // Regra 3: valida contra KNOWN_DOMAINS.
  if (KNOWN_DOMAINS.has(prefix)) {
    return prefix;
  }
  return UNKNOWN_DOMAIN;
}

/** Map em batch: util para preencher `toolsDomains` em log-decision. */
export function getToolDomains(toolNames: string[]): string[] {
  return toolNames.map(getToolDomain);
}
