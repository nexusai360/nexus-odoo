// mcp/lib/array-keys.ts
// F4 (Apresentacao, Onda 1.1): vocabulario compartilhado de chaves de array dos
// envelopes das tools, + os SUBCONJUNTOS por consumidor.
//
// IMPORTANTE (review do plano F4, correcao [P]#2): NAO existe uma unica lista
// plana. Os 6 consumidores divergem em conteudo de PROPOSITO. Esta fonte unica
// guarda o VOCABULARIO (uniao) e cada subconjunto com a semantica do consumidor.
// A Task 1.2 troca a lista local de cada consumidor pelo subconjunto certo daqui,
// preservando o comportamento byte-a-byte (teste de caracterizacao antes da troca).

/** Uniao de todas as chaves de array que aparecem em `dados` das tools de leitura.
 *  Inclui as chaves novas levantadas no inventario (familias, eventos, porEtapa,
 *  produtos) alem das ja usadas pelos consumidores. Vocabulario , nao lista de uso. */
export const ARRAY_KEYS_VOCAB = [
  "linhas",
  "titulos",
  "serie",
  "top",
  "topMaiores",
  "contas",
  "familia",
  "familias",
  "marca",
  "produtos",
  "eventos",
  "porEtapa",
] as const;

/** Ordem de PRIORIDADE (freshness/audit/extractFirstArray): decidem vazio/rowCount
 *  pelo PRIMEIRO array presente. Espelha freshness.ts ARRAY_KEYS_PRIORITY + audit.ts
 *  ARRAY_KEYS atuais (ordem semantica , NAO reordenar sem teste de caracterizacao). */
export const ARRAY_KEYS_PRIORITY = [
  "linhas",
  "titulos",
  "serie",
  "contas",
  "top",
  "familia",
  "marca",
] as const;

/** Listas grandes que o guardToolResult (run-agent) encurta para caber em 24KB.
 *  Espelha os dois loops de run-agent.ts (~147 e ~163). */
export const ARRAY_KEYS_GUARD = ["titulos", "linhas", "serie", "top"] as const;

/** Chaves que o V2 (auto-validator anti-invencao) varre buscando valor citado. */
export const ARRAY_KEYS_VALOR = ["titulos", "linhas", "serie", "top", "topMaiores"] as const;

/** Chaves que o sanitize-tool-result encurta. */
export const ARRAY_KEYS_SANITIZE = ["linhas", "titulos", "serie", "contas", "top"] as const;

// NOTA: o V6 (coerencia total x soma das linhas) usa SOMENTE `dados.linhas` , somar
// serie/titulos daria falso positivo de coerencia. NAO migrar o V6 para um subconjunto
// maior; ele permanece intencionalmente restrito a `linhas`.

/** Retorna a primeira chave de ARRAY_KEYS_PRIORITY presente em `dados` com valor
 *  Array, ou null. Helper reusavel por freshness/audit (extractFirstArray). */
export function primeiraListaDe(
  dados: Record<string, unknown> | null | undefined,
): { key: string; arr: unknown[] } | null {
  if (!dados || typeof dados !== "object") return null;
  for (const key of ARRAY_KEYS_PRIORITY) {
    const v = (dados as Record<string, unknown>)[key];
    if (Array.isArray(v)) return { key, arr: v };
  }
  return null;
}
