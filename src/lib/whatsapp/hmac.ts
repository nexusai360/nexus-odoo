/**
 * HMAC-SHA256 para autenticação do webhook receptor.
 *
 * O n8n assina o corpo cru da requisição com um shared secret
 * (WhatsappWebhook.secret descifrado) e envia:
 *   X-Signature: <hex de 64 chars>
 *   X-Timestamp:  <epoch ms como string>
 *
 * O endpoint valida a assinatura e rejeita timestamps fora da janela de ±5 min
 * (anti-replay). Combinado com dedup por messageId, cobre reentrega legítima
 * do n8n sem risco de replay mal-intencionado.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Janela de tolerância de timestamp: 5 minutos em ms. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Calcula a assinatura HMAC-SHA256 do par `body + timestamp`.
 *
 * A mensagem assinada é `${timestamp}.${body}` — o timestamp é parte da
 * mensagem assinada para evitar replay (o mesmo corpo com timestamp diferente
 * produz assinatura diferente).
 *
 * @param body      Corpo cru da requisição (string UTF-8).
 * @param secret    Segredo compartilhado (em claro, já descifrado).
 * @param timestamp Epoch ms como string (valor de X-Timestamp).
 * @returns         Hex de 64 caracteres.
 */
export function signPayload(body: string, secret: string, timestamp: string): string {
  const message = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Verifica a assinatura HMAC e o timestamp (anti-replay).
 *
 * @param body      Corpo cru da requisição.
 * @param secret    Segredo compartilhado.
 * @param signature Valor do header X-Signature.
 * @param timestamp Valor do header X-Timestamp (epoch ms como string).
 * @param now       Epoch ms atual (injetável para teste; default = Date.now()).
 * @returns         true se válido; false caso contrário.
 */
export function verifySignature(
  body: string,
  secret: string,
  signature: string,
  timestamp: string,
  now: number = Date.now(),
): boolean {
  // Validação de timestamp (anti-replay)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_MS) return false;

  // Comparação timing-safe da assinatura
  const expected = signPayload(body, secret, timestamp);

  // Normalizar comprimentos antes da comparação timing-safe
  if (signature.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
