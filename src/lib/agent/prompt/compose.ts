/**
 * Composição do system prompt do agente nexus-odoo.
 *
 * Portado de nexus-insights/src/lib/nex/prompt-compose.ts.
 * Adaptações:
 * - Removido `accountUrls` (irrelevante no domínio Odoo).
 * - Adicionado parâmetro `biSchema` opcional (Caminho 3c — admin/super_admin).
 * - `NexPromptConfig` renomeado para `AgentPromptConfig`.
 * - `IDENTITY_BASE` vem de `identity-base.ts` (domínio Odoo).
 *
 * Módulo puro/isomórfico — não importa server-only nem acessa DB ou env.
 */

import { IDENTITY_BASE } from "./identity-base";

export { IDENTITY_BASE };

export const MAX_PERSONALITY_LEN = 500;
export const MAX_TONE_LEN = 500;
export const MAX_GUARDRAIL_LEN = 300;
export const MAX_GUARDRAILS = 20;
export const MAX_PROMPT_LEN = 50_000;
export const MAX_KB_TOTAL_CHARS = 30_000;

export interface AgentPromptConfig {
  /** Texto-base do agente. NULL = usa IDENTITY_BASE hardcoded como default. */
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  kbEnabled: boolean;
  /** Mapa termo→significado para interpretar nomenclaturas custom. */
  terminology: Record<string, string>;
  /** Quando true, agente oferece sugestões em formato `[[suggestions]]:item|item`. */
  suggestionsEnabled: boolean;
}

export interface KbDocSnippet {
  name: string;
  extractedText: string;
}

/**
 * Compõe o system prompt final do agente.
 *
 * - Se `advancedOverride` estiver setado e não-vazio, retorna SOMENTE o override.
 * - Senão, monta: IDENTITY_BASE + personalidade + tom + guardrails + KB + terminologia + sugestões.
 * - Se `biSchema` for fornecido (só para admin/super_admin), appenda o bloco de schema BI.
 *
 * @param cfg       Configuração persistida em `AgentSettings`.
 * @param kbDocs    Snippets da base de conhecimento (texto extraído + nome).
 * @param _unused   Reservado para compatibilidade futura.
 * @param biSchema  DDL resumido das fact tables (Caminho 3c). Apenas admin/super_admin.
 */
export function composeSystemPrompt(
  cfg: AgentPromptConfig,
  kbDocs: KbDocSnippet[],
  _unused?: undefined,
  biSchema?: string,
): string {
  if (cfg.advancedOverride && cfg.advancedOverride.trim().length > 0) {
    return cfg.advancedOverride;
  }

  // identityBase do DB tem prioridade sobre IDENTITY_BASE hardcoded
  const baseIdentity =
    cfg.identityBase && cfg.identityBase.trim().length > 0
      ? cfg.identityBase
      : IDENTITY_BASE;

  const parts: string[] = [baseIdentity];

  if (cfg.personality.trim()) {
    parts.push(`\n\n[PERSONALIDADE]\nPersonalidade: ${cfg.personality.trim()}`);
  }

  if (cfg.tone.trim()) {
    parts.push(`\n\n[TOM]\nTom: ${cfg.tone.trim()}`);
  }

  if (cfg.guardrails.length > 0) {
    parts.push(
      `\n\n[GUARDRAILS]\nRegras importantes:\n${cfg.guardrails
        .map((g) => `- ${g.trim()}`)
        .join("\n")}`,
    );
  }

  if (cfg.kbEnabled && kbDocs.length > 0) {
    let budget = MAX_KB_TOTAL_CHARS;
    const chunks: string[] = [
      "\n\n[BASE DE CONHECIMENTO]\nConhecimento adicional fornecido pelo administrador:",
    ];
    let truncated = false;
    for (const d of kbDocs) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      const head = `\n\n=== ${d.name} ===\n`;
      const remaining = budget - head.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const body =
        d.extractedText.length <= remaining
          ? d.extractedText
          : `${d.extractedText.slice(0, remaining)}\n[...truncado...]`;
      chunks.push(`${head}${body}`);
      budget -= head.length + body.length;
      if (d.extractedText.length > remaining) {
        truncated = true;
        break;
      }
    }
    if (truncated && !chunks.join("").includes("[...truncado...]")) {
      chunks.push("\n[...truncado...]");
    }
    parts.push(chunks.join(""));
  }

  if (Object.keys(cfg.terminology).length > 0) {
    const items = Object.entries(cfg.terminology)
      .map(([term, mean]) => `- "${term}" → ${mean}`)
      .join("\n");
    parts.push(
      `\n\n## Terminologia\nQuando o usuário usar os termos abaixo, interprete-os como o significado oficial:\n${items}`,
    );
  }

  if (cfg.suggestionsEnabled) {
    parts.push(
      `\n\n## Sugestões clicáveis (HABILITADAS — USE SEMPRE QUE POSSÍVEL)\nApós responder, inclua **exatamente uma linha em branco seguida de uma linha no formato abaixo**:\n\`[[suggestions]]:Pergunta 1|Pergunta 2|Pergunta 3\`\n\nRegras:\n- Inclua 2-3 sugestões na grande maioria das respostas.\n- Omita apenas quando não existir follow-up natural.\n- Máximo 3 sugestões. Cada uma: ≤ 60 caracteres, pergunta direta, sem \`|\` no texto.\n- NUNCA repita no texto da resposta o que já está como sugestão clicável.`,
    );
  }

  if (biSchema && biSchema.trim().length > 0) {
    parts.push(
      `\n\n## Schema para consulta avançada (BI)\nUse o schema abaixo ao construir queries para \`bi_consulta_avancada\`:\n\n${biSchema.trim()}`,
    );
  }

  return parts.join("");
}
