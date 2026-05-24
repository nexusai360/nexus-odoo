/**
 * Memoria curta intra-sessao para resultados de tools deterministas. Reduz
 * latencia quando o agente repete a mesma chamada no mesmo turno (cenario
 * comum em loops de raciocinio) e quando uma nova mensagem do usuario na
 * mesma conversa retoma a mesma metrica que ja foi consultada ha pouco.
 *
 * Escopo: por `conversationId`, TTL curto (default 60s). Sem rede; vive na
 * memoria do processo do worker/server. Limpado quando o processo reinicia.
 * Para cache cross-processo, seria substituido por Redis com mesma assinatura.
 */

interface CacheEntry {
  value: string;
  expiresAt: number;
}

type ConvCache = Map<string, CacheEntry>;

const stores = new Map<string, ConvCache>();

/** TTL default em ms para entradas de cache. */
const DEFAULT_TTL_MS = 60_000;

/**
 * Recupera resultado cacheado de uma tool call ou null. A chave e
 * derivada de toolName + args canonicos (JSON ordenado).
 */
export function getCachedToolResult(
  conversationId: string | null | undefined,
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  if (!conversationId) return null;
  const store = stores.get(conversationId);
  if (!store) return null;
  const key = makeKey(toolName, args);
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

/** Grava o resultado da tool call no cache da conversa. */
export function setCachedToolResult(
  conversationId: string | null | undefined,
  toolName: string,
  args: Record<string, unknown>,
  value: string,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  if (!conversationId) return;
  let store = stores.get(conversationId);
  if (!store) {
    store = new Map();
    stores.set(conversationId, store);
  }
  store.set(makeKey(toolName, args), { value, expiresAt: Date.now() + ttlMs });
}

/** Limpa o cache de uma conversa (chamado ao "Encerrar sessao" no UI). */
export function dropConversationCache(conversationId: string): void {
  stores.delete(conversationId);
}

function makeKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(args)}`;
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj))
    return `[${obj.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
