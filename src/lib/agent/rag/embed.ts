/**
 * Geração de embeddings via OpenAI text-embedding-3-small (1536 dimensões).
 *
 * - Credencial resolvida via AppSetting chave `embedding_credential_id`
 *   (aponta para uma LlmCredential de provider openai).
 * - Dimensão travada em 1536 (SPEC §4.8 — B5).
 * - Sem credencial configurada → lança EmbeddingUnavailable (sinaliza
 *   fallback para texto integral truncado nos callers).
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

/** Modelo de embedding usado — dimensão 1536 travada. */
const EMBEDDING_MODEL = "text-embedding-3-small";
const EXPECTED_DIM = 1536;

/**
 * Erro lançado quando não há credencial de embedding configurada.
 * Os callers usam isso para cair no fallback de texto integral.
 */
export class EmbeddingUnavailable extends Error {
  constructor(reason: string) {
    super(`EmbeddingUnavailable: ${reason}`);
    this.name = "EmbeddingUnavailable";
  }
}

/**
 * Gera o embedding de `text` usando a credencial configurada em AppSetting.
 *
 * @throws {EmbeddingUnavailable} quando não há credencial configurada.
 * @throws {Error} quando a API retorna erro ou dimensão incorreta.
 */
export async function embed(text: string): Promise<number[]> {
  // 1. Resolver credencial de embedding via AppSetting
  const setting = await prisma.appSetting.findUnique({
    where: { key: "embedding_credential_id" },
  });

  if (!setting || !setting.value) {
    throw new EmbeddingUnavailable("AppSetting 'embedding_credential_id' não configurada.");
  }

  const credentialId = setting.value as string;

  const credential = await prisma.llmCredential.findUnique({
    where: { id: credentialId },
  });

  if (!credential) {
    throw new EmbeddingUnavailable(
      `Credencial '${credentialId}' referenciada em 'embedding_credential_id' não encontrada.`,
    );
  }

  // 2. Decifrar API key
  const apiKey = decrypt(credential.encryptedApiKey);

  // 3. Chamar OpenAI Embeddings API via fetch puro (padrão dos adapters)
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL,
      // dimensions não é passado — modelo retorna 1536 por padrão
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Embeddings API error ${response.status}: ${body}`);
  }

  const json = await response.json() as { data: Array<{ embedding: number[] }> };
  const vector = json.data?.[0]?.embedding;

  if (!Array.isArray(vector)) {
    throw new Error("OpenAI Embeddings API: resposta inválida — nenhum vetor retornado.");
  }

  // 4. Validar dimensão (B5 — travada em 1536)
  if (vector.length !== EXPECTED_DIM) {
    throw new Error(
      `Embedding com dimensão incorreta: esperado ${EXPECTED_DIM}, recebido ${vector.length}. ` +
        `Verifique o modelo configurado (esperado: ${EMBEDDING_MODEL}).`,
    );
  }

  return vector;
}
