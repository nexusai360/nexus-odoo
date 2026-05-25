/**
 * Cotacao USD -> BRL com decomposicao realista (PTAX + Spread bancario + IOF).
 *
 * Fonte primaria: PTAX venda do Banco Central (SGS serie 10813).
 *   - Atualizada uma vez por dia automaticamente via job na maintenance
 *     queue (worker), gravada em Redis com chave compartilhada entre worker
 *     e web. Sem chamada de IA, sem custo de LLM.
 *
 * Formula efetiva do banco (calibrada para extrato real Santander
 * 19/05/2026: US$ 111,25 -> R$ 590,68 ~= dolar efetivo R$ 5,3095):
 *   subtotal      = USD * commercial
 *   bankAmount    = subtotal * BANK_SPREAD_RATE
 *   afterSpread   = subtotal + bankAmount = subtotal * (1 + BANK_SPREAD_RATE)
 *   iofAmount     = afterSpread * IOF_RATE
 *   final         = afterSpread + iofAmount = afterSpread * (1 + IOF_RATE)
 *
 * RATE_SPREAD aqui e' apenas o multiplicador agregado para retrocompat
 * com codigo legado: (1 + BANK_SPREAD_RATE) * (1 + IOF_RATE) ~= 1.0539.
 */

// NOTA: nao usa "server-only" porque este modulo eh importado pelo worker
// (run-agent -> usage-logger -> exchange-rate). "server-only" quebra require
// quando rodando fora do Next. Protecao preservada pelo consumo (Prisma + fetch).
import { redis } from "@/lib/redis";
import {
  IOF_RATE,
  BANK_SPREAD_RATE,
  RATE_SPREAD,
  FALLBACK_COMMERCIAL_RATE,
  REDIS_KEY_USD_BRL_PTAX,
} from "./exchange-rate-constants";

export {
  IOF_RATE,
  BANK_SPREAD_RATE,
  RATE_SPREAD,
  FALLBACK_COMMERCIAL_RATE,
  REDIS_KEY_USD_BRL_PTAX,
};

const TTL_MS = 24 * 60 * 60 * 1000; // janela de cache in-process: 1 dia
const FETCH_TIMEOUT_MS = 5_000;

// Endpoints publicos.
const BCB_PTAX_SGS_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/1?formato=json";
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";

export interface UsdBrlRate {
  /** Cotacao efetiva (commercial * (1+spread) * (1+iof)). */
  rate: number;
  /** PTAX venda do dia (sem encargos). */
  commercial: number;
  /** Multiplicador agregado aplicado. */
  spread: number;
  /** true = cotacao desatualizada (fetch falhou, usando ultimo valor). */
  stale: boolean;
  source: "redis-bcb" | "live-bcb" | "live-awesomeapi" | "in-process-cache" | "fallback";
}

interface Memo {
  result: UsdBrlRate;
  fetchedAt: number;
}

let memo: Memo | null = null;

/** Limpa o cache in-process (para testes). */
export function __resetUsdBrlCache(): void {
  memo = null;
}

interface RedisSnapshot {
  commercial: number;
  fetchedAt: string; // ISO
  source: "bcb-ptax";
}

async function readRedisSnapshot(): Promise<RedisSnapshot | null> {
  try {
    const raw = await redis.get(REDIS_KEY_USD_BRL_PTAX);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisSnapshot;
    if (typeof parsed.commercial !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRedisSnapshot(snap: RedisSnapshot): Promise<void> {
  try {
    // TTL de 48h: cobre fins de semana/feriado sem PTAX nova; o worker
    // sobrescreve o valor todo dia util.
    await redis.set(
      REDIS_KEY_USD_BRL_PTAX,
      JSON.stringify(snap),
      "EX",
      48 * 60 * 60,
    );
  } catch {
    // Sem Redis disponivel: ignora; cache in-process cobre o ciclo.
  }
}

async function fetchPtaxFromBCB(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(BCB_PTAX_SGS_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`BCB SGS failed: ${res.status}`);
    const data = (await res.json()) as Array<{ data?: string; valor?: string }>;
    if (!Array.isArray(data) || data.length === 0) throw new Error("BCB vazio");
    const valor = data[0]?.valor;
    const num = Number(valor);
    if (!Number.isFinite(num) || num <= 0) throw new Error("BCB valor invalido");
    return num;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAwesomeApi(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(AWESOMEAPI_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);
    const json = (await res.json()) as { USDBRL?: { bid?: string | number } };
    const bid = json?.USDBRL?.bid;
    const num = typeof bid === "number" ? bid : Number(bid);
    if (!Number.isFinite(num) || num <= 0) throw new Error("bid invalido");
    return num;
  } finally {
    clearTimeout(timer);
  }
}

function buildRate(commercial: number, source: UsdBrlRate["source"], stale: boolean): UsdBrlRate {
  const rate = +(commercial * RATE_SPREAD).toFixed(6);
  return { rate, commercial, spread: RATE_SPREAD, stale, source };
}

/**
 * Persiste a PTAX no Redis (chamado pelo worker diariamente).
 * Tambem atualiza o cache in-process do processo chamador.
 */
export async function refreshUsdBrlRateFromBCB(): Promise<UsdBrlRate> {
  const commercial = await fetchPtaxFromBCB();
  await writeRedisSnapshot({
    commercial,
    fetchedAt: new Date().toISOString(),
    source: "bcb-ptax",
  });
  const result = buildRate(commercial, "live-bcb", false);
  memo = { result, fetchedAt: Date.now() };
  return result;
}

/**
 * Retorna a cotacao USD->BRL. Nunca lanca nem retorna null.
 * Ordem de preferencia: Redis (escrito pelo worker) > cache in-process
 * (TTL 24h) > BCB live > AwesomeAPI live > fallback constante.
 */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  // 1) cache in-process recente
  if (memo && Date.now() - memo.fetchedAt < TTL_MS) {
    return memo.result;
  }

  // 2) Redis (preferido , worker grava todo dia)
  const snap = await readRedisSnapshot();
  if (snap) {
    const result = buildRate(snap.commercial, "redis-bcb", false);
    memo = { result, fetchedAt: Date.now() };
    return result;
  }

  // 3) Live BCB direto (web fallback se worker nao escreveu ainda)
  try {
    return await refreshUsdBrlRateFromBCB();
  } catch {
    // segue para AwesomeAPI
  }

  // 4) Live AwesomeAPI (fallback secundario)
  try {
    const commercial = await fetchAwesomeApi();
    const result = buildRate(commercial, "live-awesomeapi", false);
    memo = { result, fetchedAt: Date.now() };
    return result;
  } catch {
    // segue para fallback
  }

  // 5) Cache antigo (stale) ou fallback fixo
  if (memo) {
    const stale: UsdBrlRate = { ...memo.result, stale: true, source: "in-process-cache" };
    return stale;
  }
  const fallback = buildRate(FALLBACK_COMMERCIAL_RATE, "fallback", true);
  memo = { result: fallback, fetchedAt: Date.now() };
  return fallback;
}
