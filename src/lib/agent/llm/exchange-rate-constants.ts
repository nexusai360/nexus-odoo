// Constantes puras de cambio (sem imports server-only).
// Separadas para serem usadas em client components sem puxar redis/etc.
export const IOF_RATE = 0.035;
export const BANK_SPREAD_RATE = 0.0183;
export const RATE_SPREAD = +((1 + BANK_SPREAD_RATE) * (1 + IOF_RATE)).toFixed(6);
export const FALLBACK_COMMERCIAL_RATE = 5.06;
export const REDIS_KEY_USD_BRL_PTAX = "nexus:exchange:usd-brl:ptax-venda";
