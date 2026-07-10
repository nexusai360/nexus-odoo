/**
 * Modo de resposta efetivo de uma Conexão de WhatsApp (SPEC §3.4).
 *
 * Precedência: modo da conexão → singleton global (`WhatsappChannel`) →
 * `direct`. Conexões criadas antes da coluna `response_mode` ficam com `NULL`
 * (backfill), e para elas vale o fallback , por isso qualquer regra que conte
 * "quem usa direct" precisa contar pelo modo EFETIVO, nunca pela coluna crua.
 *
 * Módulo puro, sem efeitos colaterais.
 */
import type { WhatsappResponseMode } from "@/generated/prisma/client";

export function modoEfetivo(
  conexao: WhatsappResponseMode | null | undefined,
  singleton: WhatsappResponseMode | null | undefined,
): WhatsappResponseMode {
  return conexao ?? singleton ?? "direct";
}
