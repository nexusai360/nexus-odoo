/**
 * Monta o INPUT e as INSTRUCOES para a destilacao do perfil pelo Claude headless (Onda 2).
 *
 * O headless le as conversas + avaliacoes de UM usuario e devolve um JSON
 * {interactionPrompt, presentationPrefs}. As instrucoes refletem os guardrails do parse
 * (distill-parse.ts) , o parse e a trava real, isto so orienta. Modulo PURO.
 */

import { MAX_INTERACTION_PROMPT, ALLOWLIST_BREAKDOWNS } from "./distill-parse";

export interface UserDistillInput {
  userId: string;
  conversas: { pergunta: string; resposta: string }[];
  avaliacoes: { status: string; razoes: string }[];
}

/** Playbook curto para o headless. As regras espelham distill-parse (que rejeita o que violar). */
export function buildDistillInstrucoes(): string {
  return [
    "Você é um analista que destila o PERFIL DE INTERAÇÃO de UM usuário do agente Nex.",
    "A partir das conversas e avaliações dele, escreva um resumo curto de COMO ele gosta de ser",
    "atendido: assuntos que valoriza, nível de detalhe, recortes de APRESENTAÇÃO que prefere, e",
    "acordos que ele firmou em conversa (ex.: o que ele entende por um termo).",
    "",
    "REGRAS (obrigatórias , a saída é rejeitada se violar):",
    `1. interactionPrompt: texto curto (<= ${MAX_INTERACTION_PROMPT} chars), em português, DERIVADO.`,
    "2. NUNCA inclua dado pessoal nem trechos literais: sem nomes próprios, CNPJ/CPF, valores,",
    "   e-mails, telefones, nem cópia de frases do usuário. Só descreva PREFERÊNCIAS, em termos gerais.",
    "3. NUNCA instrua a ocultar/filtrar dado (proibido: ignore, não mostre, esconda, filtre, só",
    "   considere, foca só, apenas os...). Preferência é jeito de APRESENTAR, nunca esconder dado.",
    "4. NÃO redefina conceitos/métricas/regras (faturamento, CFOP, regime continuam o que são).",
    `5. presentationPrefs (opcional): só { familia: { breakdownPreferido: <um de [${ALLOWLIST_BREAKDOWNS.join(", ")}]> } }.`,
    "6. Na dúvida, seja conservador: se não há sinal claro, devolva interactionPrompt curto e genérico.",
    "",
    'Saída: APENAS JSON puro {"interactionPrompt":"...","presentationPrefs":{...}} , sem markdown.',
  ].join("\n");
}

/** Shape do dump por usuario que vai pro /tmp e e lido pelo headless. */
export function montarDumpUsuario(input: UserDistillInput): {
  userId: string;
  conversas: { pergunta: string; resposta: string }[];
  avaliacoes: { status: string; razoes: string }[];
} {
  return {
    userId: input.userId,
    conversas: input.conversas.slice(0, 50),
    avaliacoes: input.avaliacoes.slice(0, 50),
  };
}
