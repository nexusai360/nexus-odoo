/**
 * Cotação USD→BRL com spread versionado e flag stale.
 *
 * Portado de nexus-insights/src/lib/llm/exchange-rate.ts com correções dos
 * BUGs 5 e 6:
 *  - BUG 5: em falha de fetch, nunca retornar null — devolver último cache
 *    in-process com stale=true, ou fallback fixo com stale=true.
 *  - BUG 6: spread retornado explicitamente no objeto (antes só era interno).
 *
 * Sem dependência de banco — cache em memória por processo. A persistência de
 * `app_settings` do nexus-insights é omitida neste port para evitar acoplamento;
 * o TTL in-process (4h) é suficiente para o uso no agente.
 */

const TTL_MS = 4 * 60 * 60 * 1000; // 4 horas
const FETCH_TIMEOUT_MS = 5_000;
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";

/** Spread cartão aplicado sobre a cotação comercial (BUG 6 corrigido). */
export const RATE_SPREAD = 1.10;
export const FALLBACK_COMMERCIAL_RATE = 5.5;

export interface UsdBrlRate {
  /** Cotação efetiva (commercial × spread). */
  rate: number;
  /** Cotação comercial (sem spread). */
  commercial: number;
  /** Spread aplicado — sempre RATE_SPREAD (BUG 6 corrigido). */
  spread: number;
  /** true = cotação desatualizada (fetch falhou, usando último valor). */
  stale: boolean;
  source: "live" | "in-process-cache" | "fallback";
}

interface Memo {
  result: UsdBrlRate;
  fetchedAt: number; // Date.now()
}

let memo: Memo | null = null;

/** Limpa o cache in-process (para testes). */
export function __resetUsdBrlCache(): void {
  memo = null;
}

async function fetchLiveCommercial(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(AWESOMEAPI_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { USDBRL?: { bid?: string | number } };
    const bid = json?.USDBRL?.bid;
    const num = typeof bid === "number" ? bid : Number(bid);
    if (!Number.isFinite(num) || num <= 0) throw new Error("bid inválido");
    return num;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retorna a cotação USD→BRL com spread. Nunca retorna null ou lança.
 *
 * - stale=false: cotação recente (live ou cache in-process).
 * - stale=true: fetch falhou; devolveu cache antigo ou fallback fixo.
 */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  // Cache in-process ainda válido
  if (memo && Date.now() - memo.fetchedAt < TTL_MS) {
    return memo.result;
  }

  try {
    const commercial = await fetchLiveCommercial();
    const rate = +(commercial * RATE_SPREAD).toFixed(6);
    const result: UsdBrlRate = {
      rate,
      commercial,
      spread: RATE_SPREAD,
      stale: false,
      source: "live",
    };
    memo = { result, fetchedAt: Date.now() };
    return result;
  } catch {
    // Fetch falhou — BUG 5: usar cache antigo (stale) em vez de null
    if (memo) {
      const staleResult: UsdBrlRate = {
        ...memo.result,
        stale: true,
        source: "in-process-cache",
      };
      return staleResult;
    }

    // Sem cache algum — usar fallback fixo com stale=true
    const commercial = FALLBACK_COMMERCIAL_RATE;
    const rate = +(commercial * RATE_SPREAD).toFixed(6);
    const result: UsdBrlRate = {
      rate,
      commercial,
      spread: RATE_SPREAD,
      stale: true,
      source: "fallback",
    };
    // Gravar no memo para evitar req repetidas durante o mesmo processo
    memo = { result, fetchedAt: Date.now() };
    return result;
  }
}
