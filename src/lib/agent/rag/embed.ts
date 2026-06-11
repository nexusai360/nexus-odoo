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
 * Máximo de inputs por requisição à API de embeddings. O limite oficial da
 * OpenAI é 2048; usamos uma fatia conservadora para caber também no teto de
 * tokens por requisição quando os textos são longos. O catálogo de tools
 * (~107) cabe num único chunk.
 */
const MAX_INPUTS_POR_REQUISICAO = 256;

/** Config resolvida de embedding (credencial + modelo + dimensão). */
interface ResolvedEmbedConfig {
  apiKey: string;
  model: string;
  expectedDim: number;
  credentialId: string;
}

/** Resolve credencial + modelo + dimensão numa única ida ao banco. */
async function resolveEmbedConfig(
  options: EmbedOptions,
): Promise<ResolvedEmbedConfig> {
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
  const apiKey = decrypt(credential.encryptedApiKey);
  return { apiKey, model, expectedDim, credentialId };
}

/**
 * Gera o embedding de VÁRIOS textos numa só chamada à API (input em lote).
 *
 * A API text-embedding-3 aceita um array de inputs por requisição e devolve
 * `data: [{index, embedding}, ...]`. Batchar troca N chamadas sequenciais (o
 * gargalo de ~60s no cold start do router, que embeda ~107 tools) por 1 (ou
 * poucos chunks), preservando a ordem de entrada via `index`.
 *
 * @throws {EmbeddingUnavailable} quando não há credencial configurada.
 * @throws {Error} quando a API retorna erro ou dimensão incorreta.
 */
export async function embedMany(
  texts: string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { apiKey, model, expectedDim, credentialId } =
    await resolveEmbedConfig(options);

  const out: number[][] = [];
  let totalTokens = 0;
  let totalChars = 0;
  let totalDurationMs = 0;

  for (let i = 0; i < texts.length; i += MAX_INPUTS_POR_REQUISICAO) {
    const chunk = texts.slice(i, i + MAX_INPUTS_POR_REQUISICAO);
    const startedAt = Date.now();
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: chunk,
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
      data: Array<{ index?: number; embedding: number[] }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    totalDurationMs += Date.now() - startedAt;

    const data = json.data ?? [];
    if (data.length !== chunk.length) {
      throw new Error(
        `OpenAI Embeddings API: esperado ${chunk.length} vetores, recebido ${data.length}.`,
      );
    }

    // Reordena pelo `index` retornado (a ordem da resposta deve casar com a
    // entrada, mas respeitamos o índice por segurança).
    const chunkOut: number[][] = new Array(chunk.length);
    for (let j = 0; j < data.length; j++) {
      const item = data[j];
      const idx = typeof item.index === "number" ? item.index : j;
      const vector = item.embedding;
      if (!Array.isArray(vector)) {
        throw new Error(
          "OpenAI Embeddings API: resposta inválida , nenhum vetor retornado.",
        );
      }
      if (vector.length !== expectedDim) {
        throw new Error(
          `Embedding com dimensão incorreta: esperado ${expectedDim}, recebido ${vector.length}. ` +
            `Verifique o modelo configurado (modelo atual: ${model}).`,
        );
      }
      chunkOut[idx] = vector;
    }
    for (const v of chunkOut) out.push(v);

    totalTokens += json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0;
    for (const t of chunk) totalChars += t.length;
  }

  // Telemetria de consumo (best-effort, nunca bloqueia o embedding). Uma linha
  // por lote inteiro (soma de tokens), não uma por texto.
  if (options.usage) {
    void logUsage({
      provider: "openai",
      model,
      tokensInput: totalTokens,
      tokensOutput: 0,
      requestKind: "embedding",
      origin: options.usage.origin,
      conversationId: options.usage.conversationId,
      userId: options.usage.userId,
      isPlayground: options.usage.isPlayground ?? false,
      credentialId,
      durationMs: totalDurationMs,
      promptChars: totalChars,
    }).catch(() => undefined);
  }

  return out;
}

/**
 * Gera o embedding de `text`. Atalho de 1 texto sobre `embedMany`.
 *
 * @throws {EmbeddingUnavailable} quando não há credencial configurada.
 * @throws {Error} quando a API retorna erro ou dimensão incorreta.
 */
export async function embed(
  text: string,
  options: EmbedOptions = {},
): Promise<number[]> {
  const [vector] = await embedMany([text], options);
  if (!Array.isArray(vector)) {
    throw new Error(
      "OpenAI Embeddings API: resposta inválida , nenhum vetor retornado.",
    );
  }
  return vector;
}
