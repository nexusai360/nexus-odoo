/**
 * Teste de conexão profundo por provider.
 *
 * Substitui o "ping" simples (uma chamada `chat()` qualquer) por verificações
 * específicas que diferenciam claramente:
 *  - chave inválida (401)
 *  - modelo inexistente (404 / 400 + detalhe de modelo)
 *  - sem crédito (429 + insufficient_quota / credit_balance_too_low / saldo 0)
 *  - rate limit (429 sem ser falta de crédito)
 *  - erro de rede (timeout / fetch lança)
 *  - outros (mensagem original)
 *
 * Cada provider tem seu próprio fluxo (ver spec §3.11.3). Timeout de 8 s via
 * AbortController garante que a UI nunca fica pendurada.
 */

import type { LlmProvider } from "../types";

export type ErrorKind =
  | "invalid_key"
  | "model_not_found"
  | "no_credit"
  | "rate_limit"
  | "network"
  | "other";

export interface DeepTestResult {
  /** Conexão completa (key OK + modelo OK + chamada respondeu). */
  reachable: boolean;
  /** Mensagem amigável ou bruta para fallback. */
  message?: string;
  /** Categorização do erro (quando `reachable=false` ou warning). */
  errorKind?: ErrorKind;
  /** undefined = não verificável; true = OK; false = sem saldo. */
  creditOk?: boolean;
  /** Saldo restante em USD (best-effort). */
  creditRemainingUsd?: number;
  /** Tokens usados, se a chamada foi bem-sucedida. */
  tokensInput?: number;
  tokensOutput?: number;
}

const TIMEOUT_MS = 8_000;

/**
 * Detecta modelos OpenAI da família "reasoning" (GPT-5.x, o1, o3, o4).
 *
 * Esses modelos exigem `max_completion_tokens` em vez de `max_tokens` e
 * **rejeitam** `temperature` diferente do default. Mandar o payload antigo
 * resulta em HTTP 400 com mensagens como:
 *
 *  - "Unsupported parameter: 'max_tokens' is not supported with this model.
 *     Use 'max_completion_tokens' instead."
 *  - "Unsupported value: 'temperature' does not support 0 with this model."
 *
 * O bug do v0.12.0 (tela "This page couldn't load" ao trocar para
 * gpt-5.1-mini + Testar/Salvar) é exatamente isso: a Server Action lançava
 * exceção propagada ao client e derrubava a sessão.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m.startsWith("gpt-5") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  );
}

/** Faz `fetch` com AbortController e timeout configurado. */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function networkError(err: unknown): DeepTestResult {
  const isAbort =
    err instanceof Error &&
    (err.name === "AbortError" || err.message.includes("aborted"));
  return {
    reachable: false,
    errorKind: "network",
    message: isAbort
      ? "Tempo limite excedido ao conectar com o provedor."
      : err instanceof Error
        ? err.message
        : "Erro de rede ao conectar com o provedor.",
  };
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Traduz padrões comuns das mensagens em inglês dos providers (OpenAI,
 * Anthropic, Gemini, OpenRouter) para PT-BR. Quando o padrão não casa,
 * retorna a mensagem original (melhor mostrar inglês do que sumir com a
 * informação útil pro super_admin).
 */
export function translateProviderMessage(
  raw: string | undefined | null,
  model?: string,
): string | undefined {
  if (!raw) return undefined;
  const m = raw.toLowerCase();
  // OpenAI: API split entre Chat Completions e Responses (modelos novos
  // — gpt-5.1, gpt-5.5, alguns codex — só funcionam em /v1/responses).
  if (
    /only supported in.*v1\/responses|use the.*responses.*api|only available.*via.*responses/i.test(
      raw,
    )
  ) {
    const id = model ? ` (${model})` : "";
    return `Este modelo${id} só funciona via API "Responses" da OpenAI. O Agente Nex ainda não suporta essa API — escolha outro modelo (gpt-5-mini, gpt-5.4-mini, gpt-4.1-mini ou similar).`;
  }
  // OpenAI: "This is not a chat model..." — modelo reasoning/responses-only.
  if (/this is not a chat model|did you mean to use v1\/completions|did you mean to use the v1\/responses/i.test(raw)) {
    const id = model ? ` (${model})` : "";
    return `Este modelo${id} não é compatível com o endpoint de chat (v1/chat/completions). É um modelo de raciocínio que só roda via API Responses, que o Agente Nex ainda não suporta. Escolha um modelo de chat tradicional (gpt-5-mini, gpt-5.4-mini, gpt-4.1-mini ou similar).`;
  }
  // Acesso negado / modelo não disponível.
  if (/does not exist or you do not have access/i.test(raw)) {
    return `Modelo${model ? ` "${model}"` : ""} indisponível nesta chave (acesso restrito ou ID inválido).`;
  }
  if (/do not have access/i.test(raw)) {
    return `Sua chave não tem acesso a este modelo${model ? ` (${model})` : ""}. Verifique o tier da sua conta na OpenAI.`;
  }
  if (/model.*does not exist|model.*not.*found|invalid.*model/i.test(raw)) {
    return `Modelo${model ? ` "${model}"` : ""} não existe no provedor.`;
  }
  // Limites de orçamento/contexto.
  if (
    /max_tokens or model output limit was reached|max output tokens? reached/i.test(
      m,
    )
  ) {
    return "O modelo não conseguiu completar a resposta no orçamento de tokens do teste — mas a chave e o modelo funcionam.";
  }
  if (/context.*length.*exceeded|maximum context length/i.test(m)) {
    return "Contexto da requisição excedeu o limite do modelo.";
  }
  // Quota / créditos.
  if (/insufficient_quota|insufficient.?credit|credit_balance_too_low/i.test(m)) {
    return "Conta sem crédito disponível neste provedor.";
  }
  if (/exceeded.*quota|quota.*exceeded/i.test(m)) {
    return "Cota da conta excedida. Verifique o painel do provedor.";
  }
  // Rate limit.
  if (/rate.?limit/i.test(m)) {
    return "Limite de requisições atingido. Tente novamente em alguns segundos.";
  }
  // Auth.
  if (/invalid.*api.?key|unauthorized|incorrect api key/i.test(m)) {
    return "API key inválida ou expirada.";
  }
  // Sem padrão conhecido — devolve a mensagem original com prefixo neutro.
  return raw;
}

/* -------------------------------------------------------------------------- */
/*                                  OpenAI                                    */
/* -------------------------------------------------------------------------- */

export async function deepTestOpenAI(
  apiKey: string,
  model: string,
): Promise<DeepTestResult> {
  // 1. GET /v1/models — usado APENAS para validar a key.
  // NÃO usamos a lista para checar se o modelo existe porque a OpenAI lista
  // só snapshots datados (`gpt-5.1-mini-2025-12-01`), não aliases curtos
  // (`gpt-5.1-mini`). A validação real do modelo acontece no POST abaixo:
  // se o modelo não existe ou a key não tem acesso, vem HTTP 404.
  let modelsRes: Response;
  try {
    modelsRes = await fetchWithTimeout("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    return networkError(err);
  }

  if (modelsRes.status === 401) {
    return { reachable: false, errorKind: "invalid_key" };
  }

  // Captura a lista de IDs disponíveis nessa chave — usado pra ajudar o
  // super_admin quando o modelo escolhido falhar com "does not have access".
  let availableIds: string[] = [];
  if (modelsRes.ok) {
    try {
      const body = (await modelsRes.json()) as { data?: Array<{ id: string }> };
      availableIds = body.data?.map((m) => m.id) ?? [];
    } catch {
      availableIds = [];
    }
  }

  // 2. POST /v1/chat/completions minimal — confirma que key+modelo funcionam.
  // Modelos GPT-5.x e família o-series (o1/o3/o4) só aceitam
  // `max_completion_tokens` e rejeitam `temperature` != default → ajustamos
  // o body conforme o modelo para evitar HTTP 400 (bug v0.12.0).
  const reasoningModel = isOpenAIReasoningModel(model);
  const chatBody: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: "ok" }],
  };
  // Reasoning models gastam tokens internos no thinking antes da resposta —
  // com 1 token de orçamento, batem em 400 "max_tokens or model output limit
  // was reached" sem nem terminar o thinking. 256 cobre thinking + resposta
  // curta com folga (~ $0,000512 por teste em gpt-5.4-mini).
  if (reasoningModel) {
    chatBody.max_completion_tokens = 256;
  } else {
    chatBody.max_tokens = 16;
    chatBody.temperature = 0;
  }

  let chatRes: Response;
  try {
    chatRes = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chatBody),
      },
    );
  } catch (err) {
    return networkError(err);
  }

  if (chatRes.status === 401) {
    return { reachable: false, errorKind: "invalid_key" };
  }
  if (chatRes.status === 404 || chatRes.status === 400) {
    // OpenAI pode retornar 404 OU 400 com mensagem explícita quando a chave
    // não tem acesso ao modelo (ex.: "The model `gpt-5.1-mini` does not exist
    // or you do not have access to it"). Capturamos o body literal para o
    // super_admin entender se é falta de acesso, nome errado, etc.
    const text = await chatRes.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { message?: string; code?: string; type?: string } }
      | null;
    const provMsg = parsed?.error?.message;
    // "max_tokens or model output limit was reached" significa que a key+modelo
    // FUNCIONAM — só faltou orçamento de tokens no probe. Conta como conexão OK.
    if (
      /max_tokens or model output limit was reached|max output tokens? reached/i.test(
        provMsg ?? text,
      )
    ) {
      return { reachable: true };
    }
    const isModelError =
      chatRes.status === 404 ||
      /model.*does not exist|model.*not.*found|invalid.*model|do not have access|only supported in.*v1\/responses/i.test(
        provMsg ?? text,
      );
    if (isModelError) {
      // Sugere alternativas: filtra IDs que parecem chat models e ordena
      // pelos prefixos mais próximos do que o usuário pediu.
      const chatLike = availableIds
        .filter((id) =>
          /^(gpt-|chatgpt|o1-|o1$|o3-|o3$|o4-|o4$)/i.test(id),
        )
        .sort((a, b) => a.localeCompare(b));
      const prefixMatches = chatLike.filter(
        (id) => id === model || id.startsWith(`${model}-`),
      );
      const translated =
        translateProviderMessage(provMsg, model) ??
        `Modelo "${model}" não encontrado neste provedor (HTTP ${chatRes.status}).`;
      const hint =
        prefixMatches.length > 0
          ? ` Sua chave tem acesso a: ${prefixMatches.slice(0, 3).join(", ")} (selecione "Outro (digitar manualmente)" e cole um desses).`
          : chatLike.length > 0
            ? ` Modelos disponíveis nesta chave: ${chatLike.slice(0, 8).join(", ")}${chatLike.length > 8 ? `, +${chatLike.length - 8} outros` : ""}.`
            : "";
      return {
        reachable: false,
        errorKind: "model_not_found",
        message: `${translated}${hint}`,
      };
    }
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(provMsg, model) ??
        `Erro do provedor (HTTP ${chatRes.status}): ${text || chatRes.statusText}`,
    };
  }
  if (chatRes.status === 429) {
    const text = await chatRes.text().catch(() => "");
    if (/insufficient_quota|exceeded_current_quota/i.test(text)) {
      return {
        reachable: false,
        errorKind: "no_credit",
        creditOk: false,
        message: "Conta sem crédito.",
      };
    }
    return { reachable: false, errorKind: "rate_limit" };
  }
  if (!chatRes.ok) {
    const text = await chatRes.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { message?: string } }
      | null;
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(parsed?.error?.message, model) ??
        `Erro do provedor (HTTP ${chatRes.status}): ${text || chatRes.statusText}`,
    };
  }

  const data = (await chatRes.json().catch(() => null)) as
    | { usage?: { prompt_tokens?: number; completion_tokens?: number } }
    | null;
  return {
    reachable: true,
    tokensInput: data?.usage?.prompt_tokens,
    tokensOutput: data?.usage?.completion_tokens,
  };
}

/* -------------------------------------------------------------------------- */
/*                                Anthropic                                   */
/* -------------------------------------------------------------------------- */

export async function deepTestAnthropic(
  apiKey: string,
  model: string,
): Promise<DeepTestResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ok" }],
      }),
    });
  } catch (err) {
    return networkError(err);
  }

  if (res.status === 401) {
    return { reachable: false, errorKind: "invalid_key" };
  }
  if (res.status === 404) {
    return {
      reachable: false,
      errorKind: "model_not_found",
      message: `Modelo "${model}" não encontrado neste provedor.`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { type?: string; message?: string } }
      | null;
    const errType = parsed?.error?.type ?? "";
    const errMsg = parsed?.error?.message ?? text;

    if (
      /not_found|invalid model|model.*does not exist/i.test(errMsg) ||
      errType === "not_found_error"
    ) {
      return {
        reachable: false,
        errorKind: "model_not_found",
        message:
          translateProviderMessage(errMsg, model) ??
          `Modelo "${model}" não encontrado neste provedor.`,
      };
    }
    if (
      res.status === 429 &&
      /credit_balance_too_low|insufficient/i.test(errMsg)
    ) {
      return {
        reachable: false,
        errorKind: "no_credit",
        creditOk: false,
        message: "Conta sem crédito.",
      };
    }
    if (res.status === 429) {
      return { reachable: false, errorKind: "rate_limit" };
    }
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(errMsg, model) ??
        `Erro do provedor (HTTP ${res.status}): ${errMsg || res.statusText}`,
    };
  }

  const data = (await res.json().catch(() => null)) as
    | { usage?: { input_tokens?: number; output_tokens?: number } }
    | null;
  return {
    reachable: true,
    tokensInput: data?.usage?.input_tokens,
    tokensOutput: data?.usage?.output_tokens,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Gemini                                    */
/* -------------------------------------------------------------------------- */

export async function deepTestGemini(
  apiKey: string,
  model: string,
): Promise<DeepTestResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ok" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
  } catch (err) {
    return networkError(err);
  }

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    if (/API_KEY_INVALID|api key not valid/i.test(text)) {
      return { reachable: false, errorKind: "invalid_key" };
    }
    return {
      reachable: false,
      errorKind: "invalid_key",
      message: text || res.statusText,
    };
  }

  if (res.status === 400 || res.status === 404) {
    const text = await res.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { message?: string } }
      | null;
    const errMsg = parsed?.error?.message ?? text;
    if (/not.*found|invalid.*model|model.*not.*support/i.test(errMsg)) {
      return {
        reachable: false,
        errorKind: "model_not_found",
        message:
          translateProviderMessage(errMsg, model) ??
          `Modelo "${model}" não encontrado neste provedor.`,
      };
    }
    if (/API_KEY_INVALID/i.test(errMsg)) {
      return { reachable: false, errorKind: "invalid_key" };
    }
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(errMsg, model) ??
        `Erro do provedor (HTTP ${res.status}): ${errMsg || res.statusText}`,
    };
  }

  if (res.status === 429) {
    return { reachable: false, errorKind: "rate_limit" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { message?: string } }
      | null;
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(parsed?.error?.message ?? text, model) ??
        `Erro do provedor (HTTP ${res.status}): ${text || res.statusText}`,
    };
  }

  const data = (await res.json().catch(() => null)) as
    | {
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      }
    | null;
  return {
    reachable: true,
    tokensInput: data?.usageMetadata?.promptTokenCount,
    tokensOutput: data?.usageMetadata?.candidatesTokenCount,
  };
}

/* -------------------------------------------------------------------------- */
/*                                OpenRouter                                  */
/* -------------------------------------------------------------------------- */

export async function deepTestOpenRouter(
  apiKey: string,
  model: string,
): Promise<DeepTestResult> {
  // 1. GET /api/v1/credits — valida key + saldo.
  let creditsRes: Response;
  try {
    creditsRes = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/credits",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
  } catch (err) {
    return networkError(err);
  }

  if (creditsRes.status === 401) {
    return { reachable: false, errorKind: "invalid_key" };
  }

  let creditOk: boolean | undefined;
  let creditRemainingUsd: number | undefined;
  if (creditsRes.ok) {
    const body = (await creditsRes.json().catch(() => null)) as
      | { data?: { total_credits?: number; total_usage?: number } }
      | null;
    const total = body?.data?.total_credits ?? 0;
    const used = body?.data?.total_usage ?? 0;
    const remaining = total - used;
    creditRemainingUsd = remaining;
    creditOk = remaining > 0;
  }

  // 2. POST /api/v1/chat/completions minimal.
  let chatRes: Response;
  try {
    chatRes = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ok" }],
          max_tokens: 1,
        }),
      },
    );
  } catch (err) {
    return networkError(err);
  }

  if (chatRes.status === 401) {
    return { reachable: false, errorKind: "invalid_key" };
  }
  if (chatRes.status === 404) {
    return {
      reachable: false,
      errorKind: "model_not_found",
      message: `Modelo "${model}" não encontrado neste provedor.`,
    };
  }
  if (!chatRes.ok) {
    const text = await chatRes.text().catch(() => "");
    const parsed = parseJsonSafe(text) as
      | { error?: { message?: string } }
      | null;
    const errMsg = parsed?.error?.message ?? text;
    if (/model.*not.*found|no.*model/i.test(errMsg)) {
      return {
        reachable: false,
        errorKind: "model_not_found",
        message:
          translateProviderMessage(errMsg, model) ??
          `Modelo "${model}" não encontrado neste provedor.`,
      };
    }
    if (chatRes.status === 429) {
      if (/credit|balance|insufficient/i.test(errMsg)) {
        return {
          reachable: false,
          errorKind: "no_credit",
          creditOk: false,
          creditRemainingUsd,
          message: "Conta sem crédito.",
        };
      }
      return { reachable: false, errorKind: "rate_limit" };
    }
    return {
      reachable: false,
      errorKind: "other",
      message:
        translateProviderMessage(errMsg, model) ??
        `Erro do provedor (HTTP ${chatRes.status}): ${errMsg || chatRes.statusText}`,
    };
  }

  const data = (await chatRes.json().catch(() => null)) as
    | { usage?: { prompt_tokens?: number; completion_tokens?: number } }
    | null;
  return {
    reachable: true,
    creditOk,
    creditRemainingUsd,
    tokensInput: data?.usage?.prompt_tokens,
    tokensOutput: data?.usage?.completion_tokens,
  };
}

/* -------------------------------------------------------------------------- */
/*                                Dispatcher                                  */
/* -------------------------------------------------------------------------- */

export function deepTest(
  provider: LlmProvider,
  apiKey: string,
  model: string,
): Promise<DeepTestResult> {
  switch (provider) {
    case "openai":
      return deepTestOpenAI(apiKey, model);
    case "anthropic":
      return deepTestAnthropic(apiKey, model);
    case "gemini":
      return deepTestGemini(apiKey, model);
    case "openrouter":
      return deepTestOpenRouter(apiKey, model);
  }
}

/**
 * Mapeia `errorKind` para mensagem amigável em PT-BR. Quando `kind` é "other",
 * retorna a mensagem original do provider. `undefined` para sucesso.
 */
export function describeErrorKind(
  kind: ErrorKind | undefined,
  fallback?: string,
  model?: string,
): string | undefined {
  if (!kind) return undefined;
  switch (kind) {
    case "invalid_key":
      return "API key inválida ou expirada.";
    case "model_not_found":
      // Se o provider mandou uma mensagem específica (ex.: "you do not have
      // access to this model"), preserva — é mais útil que a mensagem padrão.
      if (fallback && fallback.length > 0) return fallback;
      return model
        ? `Modelo "${model}" não encontrado neste provedor.`
        : "Modelo não encontrado neste provedor.";
    case "no_credit":
      return "Conexão OK, mas a conta está sem crédito.";
    case "rate_limit":
      return "Limite de requisições atingido. Tente novamente em alguns segundos.";
    case "network":
      return fallback ?? "Erro de rede ao conectar com o provedor.";
    case "other":
      return fallback ?? "Erro ao conectar com o provedor.";
  }
}
