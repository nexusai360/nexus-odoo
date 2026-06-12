// src/lib/agent/memoria/resumo-progressivo.ts
// Onda M (Arquitetura 3.0) M.5 , resumo progressivo da conversa (parte pura).
//
// O resumo e a camada L2 da memoria: um texto factual (cap ~600 tokens) com os
// numeros e a proveniencia do que ja foi falado, re-gerado SEMPRE a partir das
// mensagens originais (nunca resumo-de-resumo). A geracao roda fora do caminho
// critico (job BullMQ `agent-resumo-conversa`); aqui ficam as funcoes puras de
// regra de disparo, montagem do prompt e RBAC de injecao.
//
// RBAC lazy (spec §3.1): o resumo guarda os dominios dos dados que contem
// (extraidos dos toolDigests). Na injecao, se o usuario perdeu acesso a algum
// desses dominios, o resumo NAO e injetado (e o caller re-enfileira a
// re-geracao, que vai excluir o dominio revogado).

// Sem "server-only": usado pelo worker tsx e por scripts.

/** Threshold de novas mensagens desde o ultimo resumo para re-resumir. */
export const RESUMO_THRESHOLD_NOVAS_MSGS = 8;
/** Cap de tokens de saida da chamada de resumo (mini). */
export const RESUMO_MAX_TOKENS = 600;
/** Cap de chars por mensagem no transcript enviado ao resumidor. */
const CAP_CHARS_POR_MENSAGEM = 500;
/** Cap de mensagens consideradas (as mais recentes; conversas gigantes). */
export const RESUMO_MAX_MENSAGENS = 120;

export interface MensagemParaResumo {
  role: string;
  content: string;
  toolDigest?: string | null;
}

/** Regra de disparo: re-resume quando ha >= threshold mensagens novas. */
export function deveResumir(novasDesdeUltimoResumo: number): boolean {
  return novasDesdeUltimoResumo >= RESUMO_THRESHOLD_NOVAS_MSGS;
}

/** Extrai o dominio do formato canonico do toolDigest ("... dominio=X ..."). */
export function extrairDominioDoDigest(digest: string): string | null {
  const m = digest.match(/\bdominio=([a-z_]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

const SYSTEM_RESUMO = `Voce resume conversas entre um usuario e o Nex, agente de dados de um grupo de empresas (ERP: estoque, fiscal, financeiro, comercial, contabil, cadastros).

Regras do resumo:
- FACTUAL e compacto, em topicos por assunto; portugues do Brasil.
- Todo numero relevante aparece EXATO como na conversa, com a proveniencia entre parenteses (a tool/consulta de origem, presente nos blocos [consultas: ...]).
- Inclua: o que foi perguntado, o que foi respondido (numeros-chave), periodos e entidades (produtos, empresas, vendedores, clientes).
- NAO invente nem arredonde numeros; nao opine; nao use markdown alem de hifens.
- Maximo ~400 palavras.`;

/**
 * Monta o prompt de resumo a partir das mensagens ORIGINAIS da conversa.
 * Conteudo de cada assistant inclui o toolDigest (proveniencia dos numeros).
 */
export function montarPromptResumo(mensagens: MensagemParaResumo[]): {
  system: string;
  user: string;
} {
  const linhas = mensagens.slice(-RESUMO_MAX_MENSAGENS).map((m) => {
    const prefixo = m.role === "user" ? "U" : "A";
    const texto = m.content.slice(0, CAP_CHARS_POR_MENSAGEM);
    const digest = m.toolDigest ? ` [consultas: ${m.toolDigest}]` : "";
    return `${prefixo}: ${texto}${digest}`;
  });
  return {
    system: SYSTEM_RESUMO,
    user: `Conversa (mais antiga primeiro):\n\n${linhas.join("\n")}\n\nResuma a conversa acima.`,
  };
}

/**
 * RBAC lazy da injecao: o resumo so entra no prompt se o usuario ainda tem
 * acesso a TODOS os dominios cujos dados o resumo contem.
 */
export function podeInjetarResumo(
  resumoDominios: string[],
  userAllowedDomains: Set<string> | "all",
): boolean {
  if (userAllowedDomains === "all") return true;
  return resumoDominios.every((d) => userAllowedDomains.has(d));
}
