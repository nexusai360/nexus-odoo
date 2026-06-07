// F3 (cerebro, onda 3b): injeta/limita argumentos da tool conforme a intencao
// classificada (classify-intent.ts). DETERMINISTICO, em codigo, entre os args que
// o LLM montou e a chamada da tool (run-agent ~1241). Spec F3 secao 5.1.
//
// Regras:
//  - exaustiva: cap limit em 50 (vence o do LLM se maior; preserva menor).
//  - amostragem: limit 3-5.
//  - ranking: preserva orderBy do LLM; se a tool NAO suporta orderBy, degrada
//    para pontual com aviso (nunca quebra).
//  - pontual: nao mexe.
// So injeta limit/orderBy quando a tool de fato suporta o campo (toolSupports).

import type { Intent } from "./classify-intent";

export const EXAUSTIVA_LIMIT = 50;
export const AMOSTRAGEM_LIMIT = 5;

export type ToolSupports = { limit: boolean; orderBy: boolean };

export type ApplyIntentResult = {
  args: Record<string, unknown>;
  /** true quando ranking degradou para pontual (tool nao suporta orderBy). */
  degradou: boolean;
  /** mensagem para log/envelope quando houve degradacao. */
  aviso?: string;
};

export function applyIntentArgs(
  intent: Intent,
  llmArgs: Record<string, unknown>,
  toolSupports: ToolSupports,
): ApplyIntentResult {
  const args: Record<string, unknown> = { ...llmArgs };

  if (intent === "pontual") {
    return { args, degradou: false };
  }

  if (intent === "ranking") {
    if (!toolSupports.orderBy) {
      // Sem como ordenar => ranking nao faz sentido; degrada para pontual.
      return {
        args,
        degradou: true,
        aviso:
          "Intencao de ranking detectada, mas a tool nao suporta ordenacao (orderBy); " +
          "respondendo de forma pontual.",
      };
    }
    // orderBy do LLM preservado; nada a forcar (o N vem do limit do LLM).
    return { args, degradou: false };
  }

  // exaustiva / amostragem: capam o limit (so se a tool suporta).
  if (toolSupports.limit) {
    const cap = intent === "exaustiva" ? EXAUSTIVA_LIMIT : AMOSTRAGEM_LIMIT;
    const atual = typeof args.limit === "number" ? (args.limit as number) : undefined;
    // exaustiva: cap vence o do LLM se maior; preserva menor. amostragem: fixa o cap.
    if (intent === "exaustiva") {
      args.limit = atual !== undefined ? Math.min(atual, cap) : cap;
    } else {
      args.limit = cap;
    }
  }
  return { args, degradou: false };
}
