/**
 * Autenticação dos webhooks de WhatsApp.
 *
 * ENTRADA (n8n → plataforma): autenticação por TOKEN FIXO. Quem envia coloca o
 * token do webhook (WhatsappWebhook.secret descifrado) no header
 * `Authorization: Bearer <token>`; o endpoint compara em tempo constante com o
 * secret salvo (`verifyToken`). Simples de configurar; sobre HTTPS e com dedup
 * por messageId é seguro para o hop interno.
 *
 * SAÍDA (plataforma → n8n): a resposta do agente é assinada com HMAC-SHA256
 * (`signPayload`), calculada automaticamente pela plataforma. Mantido para os
 * webhooks de saída (`emit-reply`).
 */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Calcula a assinatura HMAC-SHA256 do par `body + timestamp` (usado na SAÍDA).
 *
 * A mensagem assinada é `${timestamp}.${body}` , o timestamp entra na mensagem
 * para evitar replay (o mesmo corpo com timestamp diferente muda a assinatura).
 *
 * @param body      Corpo cru da requisição (string UTF-8).
 * @param secret    Segredo compartilhado (em claro, já descifrado).
 * @param timestamp Epoch ms como string.
 * @returns         Hex de 64 caracteres.
 */
export function signPayload(body: string, secret: string, timestamp: string): string {
  const message = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Compara, em tempo constante, o token recebido com o secret esperado do webhook
 * (autenticação da ENTRADA). Vazio ou comprimento diferente → falso.
 *
 * @param provided Token recebido (valor após "Bearer " no header Authorization).
 * @param expected Secret do webhook em claro (já descifrado).
 * @returns        true se iguais; false caso contrário.
 */
export function verifyToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
