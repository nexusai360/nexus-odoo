/**
 * Contrato Zod do payload inbound (n8n → plataforma).
 *
 * Conforme SPEC §6.1.3. O n8n monta este payload a partir da mensagem
 * original do WhatsApp e envia ao endpoint /api/integrations/whatsapp/inbound.
 *
 * Headers esperados:
 *   X-Signature: HMAC-SHA256 hex do corpo cru
 *   X-Timestamp: epoch ms como string
 */

import { z } from "zod";

export const inboundSchema = z.object({
  /** ID da mensagem no WhatsApp — chave de dedup. */
  messageId: z.string().min(1),

  /** Número E.164 do remetente (ex.: "+5511999999999"). */
  from: z.string().min(1),

  /** Epoch ms de envio da mensagem (Unix timestamp em ms). */
  timestamp: z.number().int().positive(),

  /** Tipo da mensagem. */
  type: z.enum(["text", "audio"]),

  /** Texto da mensagem (presente quando type=text). */
  text: z.string().optional(),

  /** Media ID para download do áudio na Graph API (presente quando type=audio). */
  audioMediaId: z.string().optional(),
});

export type InboundPayload = z.infer<typeof inboundSchema>;
