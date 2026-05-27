/**
 * Cliente de embeddings para a inteligencia do Agente Nex.
 *
 * Wrapper sobre `@/lib/agent/rag/embed` (F5 RAG) , mesma credencial OpenAI
 * via `AppSetting.embedding_credential_id`, mesmo modelo
 * `text-embedding-3-small` (1536 dim). Justificativa: nao recriar o pipeline
 * de credenciais.
 *
 * Spec: §5.3 + §3.5 + Q5 do plan review-2.
 */

import "server-only";

import { embed as ragEmbed, EmbeddingUnavailable } from "@/lib/agent/rag/embed";

export { EmbeddingUnavailable };

/**
 * Gera embedding (1536) do texto. Encaminha para o pipeline F5 RAG existente.
 *
 * @throws EmbeddingUnavailable quando credencial nao esta configurada.
 */
export async function embed(text: string): Promise<number[]> {
  return ragEmbed(text);
}
