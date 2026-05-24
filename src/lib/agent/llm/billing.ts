/**
 * Consulta de saldo/crédito da conta do provedor por chave de API.
 *
 * Nem todo provedor expõe um endpoint público de saldo:
 *  - OpenRouter → GET /api/v1/credits (total_credits − total_usage).
 *  - OpenAI/Anthropic/Gemini → não há endpoint estável de saldo com a própria
 *    API key (billing fica atrás de cookie de sessão do dashboard). Retornamos
 *    `unavailable` , a UI mostra "saldo indisponível" + link "Adicionar crédito".
 *
 * O resultado é persistido em `LlmCredential` (balanceUsd/balanceStatus/
 * balanceCheckedAt) e atualizado após cada uso da chave pelo agente.
 *
 * Módulo server-only , usa `fetch` direto, sem SDK.
 */

import type { LlmProvider } from "./types";

/** Status da consulta de saldo. */
export type BalanceStatus = "ok" | "unavailable" | "error";

export interface BalanceResult {
  status: BalanceStatus;
  /** Saldo em USD quando status === "ok". */
  balanceUsd: number | null;
  currency: string | null;
  /** Mensagem de erro/explicação quando status !== "ok". */
  message?: string;
}

const TIMEOUT_MS = 8_000;

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

/** Saldo da conta OpenRouter via GET /api/v1/credits. */
async function fetchOpenRouterBalance(apiKey: string): Promise<BalanceResult> {
  try {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) {
      return {
        status: "error",
        balanceUsd: null,
        currency: null,
        message: "Chave inválida ou expirada.",
      };
    }
    if (!res.ok) {
      return {
        status: "error",
        balanceUsd: null,
        currency: null,
        message: `Falha ao consultar saldo (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json().catch(() => null)) as
      | { data?: { total_credits?: number; total_usage?: number } }
      | null;
    const total = body?.data?.total_credits ?? 0;
    const used = body?.data?.total_usage ?? 0;
    const remaining = Math.round((total - used) * 10_000) / 10_000;
    return { status: "ok", balanceUsd: remaining, currency: "USD" };
  } catch {
    return {
      status: "error",
      balanceUsd: null,
      currency: null,
      message: "Erro de rede ao consultar saldo.",
    };
  }
}

/** Provedores sem endpoint público de saldo via API key. */
const UNAVAILABLE_MESSAGE =
  "Este provedor não expõe consulta de saldo via API. Veja o painel de billing.";

/**
 * Consulta o saldo da conta do provedor para uma chave de API.
 *
 * @param provider Provedor da chave.
 * @param apiKey   Chave de API decifrada.
 */
export async function fetchProviderBalance(
  provider: LlmProvider,
  apiKey: string,
): Promise<BalanceResult> {
  switch (provider) {
    case "openrouter":
      return fetchOpenRouterBalance(apiKey);
    case "openai":
    case "anthropic":
    case "gemini":
      return {
        status: "unavailable",
        balanceUsd: null,
        currency: null,
        message: UNAVAILABLE_MESSAGE,
      };
  }
}
