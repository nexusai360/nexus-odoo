/**
 * Geração de embeddings via OpenAI (família text-embedding-3).
 *
 * - Credencial resolvida via AppSetting chave `embedding_credential_id`
 *   (aponta para uma LlmCredential de provider openai).
 * - Modelo e dimensão configuráveis (AppSetting `embedding_model` /
 *   `embedding_dimensions`, ou env `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS`,
 *   ou default text-embedding-3-small/1536). O override por env/opção existe
 *   para A/B testar small vs large na calibragem do router.
 * - Sem credencial configurada → lança EmbeddingUnavailable (sinaliza
 *   fallback para texto integral truncado nos callers).
 * - Quando recebe `usage` no contexto, registra a chamada em LlmUsage (custo
 *   por modelo + origem aparecem no menu de Consumo).
 *
 * IMPORTANTE: modelo e dimensão precisam ser os MESMOS para a pergunta e para
 * os vetores de domínio (embed-domains), senão o cosseno fica sem sentido.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { logUsage } from "@/lib/agent/llm/usage-logger";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

/** Dimensão nativa de cada modelo da família 3. */
function defaultDimensionsFor(model: string): number {
  return model.includes("large") ? 3072 : 1536;
}

/** Contexto de telemetria: quando presente, a chamada vira uma linha de
 *  consumo (LlmUsage) com a origem informada. */
export interface EmbedUsageContext {
  /** Tag de origem no consumo: "router", "router_calibracao", etc. */
  origin?: string;
  conversationId?: string;
  userId?: string;
  isPlayground?: boolean;
}

export interface EmbedOptions {
  /** Override do modelo de embedding (precedência sobre env/AppSetting). */
  model?: string;
  /** Override da dimensão (precedência sobre env/AppSetting). */
  dimensions?: number;
  /** Quando presente, registra a chamada em LlmUsage. */
  usage?: EmbedUsageContext;
}

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

/** Resolve modelo de embedding a partir de opção > env > AppSetting > default. */
function resolveModel(
  optModel: string | undefined,
  settings: Map<string, string>,
): string {
  return (
    optModel ??
    process.env.EMBEDDING_MODEL ??
    settings.get("embedding_model") ??
    DEFAULT_EMBEDDING_MODEL
  );
}

/** Resolve dimensão a partir de opção > env > AppSetting > nativa do modelo. */
function resolveDimensions(
  optDims: number | undefined,
  settings: Map<string, string>,
  model: string,
): number {
  if (optDims !== undefined) return optDims;
  const envDims = process.env.EMBEDDING_DIMENSIONS;
  if (envDims && !Number.isNaN(Number(envDims))) return Number(envDims);
  const settingDims = settings.get("embedding_dimensions");
  if (settingDims && !Number.isNaN(Number(settingDims))) {
    return Number(settingDims);
  }
  return defaultDimensionsFor(model);
}

/**
 * Gera o embedding de `text`.
 *
 * @throws {EmbeddingUnavailable} quando não há credencial configurada.
 * @throws {Error} quando a API retorna erro ou dimensão incorreta.
 */
export async function embed(
  text: string,
  options: EmbedOptions = {},
): Promise<number[]> {
  // 1. Resolver credencial + config de modelo numa única ida ao banco.
  const settingRows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: ["embedding_credential_id", "embedding_model", "embedding_dimensions"],
      },
    },
  });
  const settings = new Map<string, string>();
  for (const row of settingRows) {
    if (row.value) settings.set(row.key, row.value as string);
  }

  const credentialId = settings.get("embedding_credential_id");
  if (!credentialId) {
    throw new EmbeddingUnavailable(
      "AppSetting 'embedding_credential_id' não configurada.",
    );
  }

  const credential = await prisma.llmCredential.findUnique({
    where: { id: credentialId },
  });
  if (!credential) {
    throw new EmbeddingUnavailable(
      `Credencial '${credentialId}' referenciada em 'embedding_credential_id' não encontrada.`,
    );
  }

  const model = resolveModel(options.model, settings);
  const expectedDim = resolveDimensions(options.dimensions, settings, model);

  // 2. Decifrar API key
  const apiKey = decrypt(credential.encryptedApiKey);

  // 3. Chamar OpenAI Embeddings API via fetch puro (padrão dos adapters)
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model,
      // A família text-embedding-3 aceita encurtar dimensões nativamente.
      dimensions: expectedDim,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Embeddings API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };
  const durationMs = Date.now() - startedAt;
  const vector = json.data?.[0]?.embedding;

  if (!Array.isArray(vector)) {
    throw new Error(
      "OpenAI Embeddings API: resposta inválida , nenhum vetor retornado.",
    );
  }

  // 4. Validar dimensão (deve bater com a configurada)
  if (vector.length !== expectedDim) {
    throw new Error(
      `Embedding com dimensão incorreta: esperado ${expectedDim}, recebido ${vector.length}. ` +
        `Verifique o modelo configurado (modelo atual: ${model}).`,
    );
  }

  // 5. Telemetria de consumo (best-effort, nunca bloqueia o embedding).
  if (options.usage) {
    const tokens =
      json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0;
    void logUsage({
      provider: "openai",
      model,
      tokensInput: tokens,
      tokensOutput: 0,
      requestKind: "embedding",
      origin: options.usage.origin,
      conversationId: options.usage.conversationId,
      userId: options.usage.userId,
      isPlayground: options.usage.isPlayground ?? false,
      credentialId,
      durationMs,
      promptChars: text.length,
    }).catch(() => undefined);
  }

  return vector;
}
