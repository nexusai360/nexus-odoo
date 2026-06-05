// Montagem da conversa inicial enviada ao LLM.
//
// Otimizacao de custo (alavanca 1, prompt caching): a data atual NAO pode ficar
// no topo do system prompt. O cache da OpenAI desconta a porcao PREFIXO que for
// identica entre chamadas; com a data (que muda) no topo, nada do system fica
// cacheavel. Aqui a data entra como um item de input proprio, logo antes da
// pergunta do usuario, deixando o prefixo (system base + tools) 100% estavel.
//
// Spec: docs/superpowers/specs/2026-06-03-otimizacao-custo-agente-design.md §4.
import type { ChatMessage } from "@/lib/agent/llm/types";

export interface MontarConversaArgs {
  /** System prompt SEM data , o prefixo estavel e cacheavel. */
  systemPromptBase: string;
  /** Historico ja sanitizado (pares tool_use/tool_result preservados). */
  historyMessages: ChatMessage[];
  /** Pergunta atual do usuario. */
  userMessage: string;
  /** Ex.: "quarta-feira, 03/06/2026" (locale pt-BR). Granularidade de dia. */
  agoraBrt: string;
}

/** Monta a conversa inicial: system estavel + historico + item de data + pergunta. */
export function montarConversa(args: MontarConversaArgs): { conversation: ChatMessage[] } {
  const dataItem: ChatMessage = {
    role: "user",
    content:
      `[Contexto] Data atual (America/Sao_Paulo, UTC-3): ${args.agoraBrt}. ` +
      `Use SEMPRE esta data para resolver "hoje", "ontem", "amanha", "mes corrente", "essa semana" e "este ano".`,
  };
  const conversation: ChatMessage[] = [
    { role: "system", content: args.systemPromptBase },
    ...args.historyMessages,
    dataItem,
    { role: "user", content: args.userMessage },
  ];
  return { conversation };
}
