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
  /**
   * Onda M (Arquitetura 3.0): toolDigests de turnos ANTERIORES a janela ,
   * a memoria de numeros antigos da conversa. Entram como bloco proprio
   * logo apos o system (depois do prefixo cacheavel; muda pouco entre turnos).
   */
  memoriaConsultas?: string[];
  /** Onda M (M.3): bloco curto da working memory (formatarFocoAtual). */
  focoAtualTexto?: string;
  /**
   * Onda M (M.5): resumo progressivo da conversa (L2). Entra entre o system
   * e a memoria de consultas. O caller ja aplicou o RBAC (podeInjetarResumo).
   */
  resumoConversa?: string;
}

/** Monta a conversa inicial: system estavel + historico + item de data + pergunta. */
export function montarConversa(args: MontarConversaArgs): { conversation: ChatMessage[] } {
  const dataItem: ChatMessage = {
    role: "user",
    content:
      `[Contexto] Data atual (America/Sao_Paulo, UTC-3): ${args.agoraBrt}. ` +
      `Use SEMPRE esta data para resolver "hoje", "ontem", "amanha", "mes corrente", "essa semana" e "este ano".` +
      (args.focoAtualTexto ? `\n[Foco da conversa] ${args.focoAtualTexto}` : ""),
  };
  // Onda M (M.5): resumo progressivo (L2) , logo apos o system, antes da
  // memoria de consultas. Numeros aqui SAO fonte legitima (fontesMemoria).
  const resumoItens: ChatMessage[] = args.resumoConversa
    ? [
        {
          role: "user" as const,
          content:
            "[Resumo da conversa] O que ja foi falado ate aqui (numeros confirmados, com a fonte entre parenteses):\n" +
            args.resumoConversa,
        },
      ]
    : [];
  // Onda M: memoria de consultas antigas (digests fora da janela verbatim).
  // Numeros aqui SAO fonte legitima (os validadores recebem as mesmas fontes).
  const memoriaItens: ChatMessage[] =
    args.memoriaConsultas && args.memoriaConsultas.length > 0
      ? [
          {
            role: "user" as const,
            content:
              "[Memória da conversa] Consultas feitas em turnos anteriores (números já confirmados; use-os para responder referências ao que já foi falado):\n" +
              args.memoriaConsultas.map((d) => `- ${d}`).join("\n"),
          },
        ]
      : [];
  const conversation: ChatMessage[] = [
    { role: "system", content: args.systemPromptBase },
    ...resumoItens,
    ...memoriaItens,
    ...args.historyMessages,
    dataItem,
    { role: "user", content: args.userMessage },
  ];
  return { conversation };
}
