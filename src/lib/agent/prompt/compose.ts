/**
 * Composição do system prompt do agente nexus-odoo.
 *
 * Portado de nexus-insights/src/lib/nex/prompt-compose.ts.
 * Adaptações:
 * - Removido `accountUrls` (irrelevante no domínio Odoo).
 * - Adicionado parâmetro `biSchema` opcional (Caminho 3c, admin/super_admin).
 * - `NexPromptConfig` renomeado para `AgentPromptConfig`.
 * - `IDENTITY_BASE` vem de `identity-base.ts` (domínio Odoo).
 *
 * Módulo puro/isomórfico. Não importa server-only nem acessa DB ou env.
 */

import { IDENTITY_BASE } from "./identity-base";

export { IDENTITY_BASE };

// Limites elevados no rework F5-UI v2: comportamento/tom 1000, cada guardrail
// 500, guardrails sem teto de quantidade. MAX_GUARDRAILS é só referência
// defensiva interna (não imposto na UI).
export const MAX_PERSONALITY_LEN = 1000;
export const MAX_TONE_LEN = 1000;
export const MAX_GUARDRAIL_LEN = 500;
export const MAX_GUARDRAILS = 1000;
/** Cap independente do texto do prompt (identityBase + advancedOverride). */
export const MAX_PROMPT_LEN = 100_000;
/** Cap total dos documentos da base de conhecimento. Independente do prompt. */
export const MAX_KB_TOTAL_CHARS = 1_000_000;

/**
 * Origem do turno atual. Influencia o prompt:
 * - "suggestion": resposta direta, sem nova clarificacao.
 * - demais valores: comportamento padrao.
 */
export type AgentPromptSource =
  | "bubble"
  | "suggestion"
  | "whatsapp"
  | "playground";

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
  /** Máximo de sugestões por resposta. Default 3, hard cap 5 (forçado em
   *  `extractSuggestions`). Substitui o valor no texto instrucional. */
  maxSuggestions?: number;
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
  source: AgentPromptSource = "bubble",
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

  parts.push(
    "\n\n## Comportamento" +
      "\n- Use bom senso para defaults razoaveis. Quando o usuario disser \"recente\", \"atual\", \"do mes\", assuma o mes do calendario corrente (1 ao ultimo dia do mes) e indique a janela considerada numa frase curta no inicio da resposta." +
      "\n- Quando o usuario disser \"ultimos N dias\" ou \"ultimas N semanas\", use janela rolante a partir de hoje, contando o dia atual." +
      "\n- Nao faca mais de uma rodada de clarificacao por turno. Se a pergunta tem multiplas leituras, escolha a mais comum, anuncie em uma frase e responda direto. So pergunte de volta quando responder de fato bloquear a entrega." +
      "\n- Quando oferecer opcoes, cubra todas as fatias naturais do dado: tudo, somente em aberto, somente vencidos quando for divida, somente do periodo em foco. Nao apresente lista parcial que omita a fatia obvia.",
  );

  if (source === "suggestion") {
    parts.push(
      "\n\n## Entrada veio de sugestao clicada" +
        "\nO usuario clicou em uma sugestao de pergunta. Responda direto com os dados solicitados; nao peca nova clarificacao." +
        " Se faltar algum parametro nao informado na sugestao, escolha o default mais natural, anuncie em uma linha e entregue a resposta.",
    );
  }

  if (source === "whatsapp") {
    parts.push(
      "\n\n## Canal WhatsApp" +
        "\n- A resposta vai para WhatsApp. Use a sintaxe propria do WhatsApp: *negrito*, _italico_, ~tachado~, ```bloco de codigo```." +
        "\n- Sem tabelas. Sem cabecalhos markdown. Sem listas aninhadas." +
        "\n- Frases ainda mais curtas que o normal. Cada paragrafo separado por linha em branco." +
        "\n- Numeros em formato brasileiro (1.234,56) e datas dd/mm/aaaa." +
        "\n- Quando oferecer sugestoes de continuidade, termine a mensagem com a linha exata 'Voce tambem pode perguntar:' seguida de ate 3 opcoes numeradas (1, 2, 3) em linhas proprias. Sem usar o canal [[suggestions]] (o WhatsApp nao renderiza chips clicaveis; o usuario responde com o numero).",
    );
  }

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
    const maxSugg = Math.min(Math.max(1, cfg.maxSuggestions ?? 3), 5);
    parts.push(
      `\n\n## Sugestoes de pergunta (HABILITADAS, USE SEMPRE QUE POSSIVEL)\nApos responder, inclua **exatamente uma linha em branco seguida de uma linha no formato abaixo**:\n\`[[suggestions]]:Pergunta 1|Pergunta 2|Pergunta 3\`\n\nRegras:\n- Inclua ate **${maxSugg} sugestoes** na grande maioria das respostas (o maximo esta configurado em ${maxSugg}; nunca passe disso).\n- Cada sugestao precisa ser uma **pergunta completa e objetiva**, que voce consiga responder direto sem nova clarificacao. Nunca use "Quer ver tal coisa?" ou "Posso te mostrar X?".\n- Inclua os parametros obvios na propria sugestao (periodo, tipo de registro, escopo). Ex.: "Liste contas a receber em aberto em ${"05/2026"}" em vez de "Quer a lista de contas a receber?".\n- Cubra todas as fatias naturais do dado quando a resposta abrir opcoes: tudo, somente em aberto, somente vencidos quando for divida, somente do periodo em foco. Nao omita a fatia obvia.\n- Cada sugestao: <= 80 caracteres, sem \`|\` no texto, sem repetir o que ja esta no corpo da resposta.\n- Omita o bloco apenas quando nao existir follow-up natural.\n- Quando a resposta for uma pergunta de desambiguacao, as sugestoes DEVEM resolver a ambiguidade: ofereca as opcoes concretas (cada registro que casou pelo nome, ou os sentidos possiveis da metrica). E o caso de maior prioridade para incluir sugestoes, respeitando o teto de ${maxSugg}.`,
    );
  }

  if (biSchema && biSchema.trim().length > 0) {
    parts.push(
      `\n\n## Schema para consulta avançada (BI)\nUse o schema abaixo ao construir queries para \`bi_consulta_avancada\`:\n\n${biSchema.trim()}`,
    );
  }

  // REGRA OBRIGATORIA appendada por ULTIMO no system prompt. Razao:
  // recency bias dos LLMs (instrucoes finais tem mais peso). Sobrescreve
  // regras de desambiguacao do identity_base que falavam "pergunte de
  // volta quando ambiguo". Tambem usa linguagem mais forte que conflitos
  // anteriores. Resolve bug 2026-05-25: agente continuava perguntando
  // "qual visao quer?" mesmo apos diretiva ser appendada apos
  // Comportamento (LLM seguia regras anteriores mais detalhadas).
  parts.push(
    "\n\n## REGRA FINAL OBRIGATORIA (sobrescreve QUALQUER instrucao anterior conflitante)" +
      "\n\nQuando uma ferramenta retornar muitos registros (resultado grande, truncado, ou que cobre varias categorias/status/situacoes), VOCE NUNCA pode responder com pergunta de desambiguacao do tipo \"qual visao voce quer?\" ou \"prefere ver X ou Y?\". Essa abordagem esta PROIBIDA mesmo que o bloco \"Desambiguacao\" da identidade base diga o contrario." +
      "\n\nFaca SEMPRE assim, sem excecao:" +
      "\n1. Agrupe os registros pela dimensao natural (status, situacao, categoria, mes, conta, tipo)." +
      "\n2. Traga a CONTAGEM por grupo + o TOTAL. Quando fizer sentido, traga o VALOR AGREGADO (soma de R$, soma de quantidade)." +
      "\n3. Apos o quantitativo, ofereca drill-down nas sugestoes [[suggestions]]. Cada chip e uma pergunta concreta que abriria UMA fatia." +
      "\n\nEXEMPLO CORRETO (FACA assim):" +
      "\n\"Em 05/2026 constam **234 notas fiscais** emitidas: **152 autorizadas**, **41 em digitacao**, **28 rejeitadas** e **13 inutilizadas**. Total faturado nas autorizadas: **R$ 35.421.925,20**.\"" +
      "\n[[suggestions]]:Liste as 152 autorizadas|Mostre as 28 rejeitadas|Compare 05/2026 com 04/2026" +
      "\n\nEXEMPLO PROIBIDO (NUNCA faca, mesmo se a identidade base sugerir):" +
      "\n\"Encontrei X notas fiscais. Qual visao voce quer? - Somente autorizadas - Todas\"" +
      "\n\nA regra acima TEM PRIORIDADE sobre qualquer politica de desambiguacao da identidade. Quando houver conflito, esta regra vence. Em caso de duvida, traga o quantitativo primeiro e use as sugestoes [[suggestions]] para o drill-down.",
  );

  return parts.join("");
}
