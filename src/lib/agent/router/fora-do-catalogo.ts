// F3 (cerebro, onda 3c): decisao deterministica de "Fora do Catalogo".
//
// Tres desfechos (spec F3 secao 6):
//  - fora_de_escopo: a pergunta nao e de negocio (sem tool acima do limiar E
//    assunto fora dos dominios) => recusa educada (o LLM so redige o texto).
//  - falta_honesta: assunto e do escopo, mas o dado nao existe (dominio vazio,
//    campo ausente) => resposta honesta de falta + registrar_lacuna.
//  - prosseguir: ha tool/dado => fluxo normal.
//
// Funcao PURA. O run-agent fornece os sinais (retrieval, score, dominios, dado).
// Conservadora: so classifica fora_de_escopo com sinal forte (retrieval vazio E
// score abaixo do limiar E assunto fora dos dominios), para nao recusar pergunta
// valida (falso 3b).

export type ForaDoCatalogoDecisao = "fora_de_escopo" | "falta_honesta" | "prosseguir";

/** Conjunto de dominios que NAO contam como "assunto de negocio" para a decisao
 *  de Fora de Escopo (transversais/escape-hatch). Espelha EXCLUDE_FROM_FILTERING
 *  + o pseudo-dominio de chat. */
export const DOMINIOS_NAO_NEGOCIO: ReadonlySet<string> = new Set([
  "transversal",
  "dominios-vazios",
  "caminho3",
  "chat",
]);

export type ForaDoCatalogoSinais = {
  /** O retrieval nao ofereceu nenhuma tool relevante (alem do piso). */
  retrievalVazio: boolean;
  /** Maior score de dominio do router (topScore). */
  topScore: number;
  /** Limiar de confianca do router (routerThreshold). */
  limiar: number;
  /** A pergunta nao bate com nenhum dominio de negocio conhecido. */
  assuntoForaDosDominios: boolean;
  /** O dado pedido existe no cache (dominio populado / campo presente). */
  dadoExisteNoEscopo: boolean;
};

export function decideForaDoCatalogo(s: ForaDoCatalogoSinais): ForaDoCatalogoDecisao {
  // Fora de Escopo: sinal forte de que nem e pergunta de negocio.
  if (s.retrievalVazio && s.topScore < s.limiar && s.assuntoForaDosDominios) {
    return "fora_de_escopo";
  }
  // Falta Honesta: e do escopo, mas nao temos o dado.
  if (!s.dadoExisteNoEscopo && !s.assuntoForaDosDominios) {
    return "falta_honesta";
  }
  return "prosseguir";
}
