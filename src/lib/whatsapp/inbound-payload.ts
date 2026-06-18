/**
 * Contrato Zod do payload inbound (n8n → plataforma) , F5.1.
 *
 * O n8n filtra a mensagem original do WhatsApp e envia ESTE JSON tratado ao
 * webhook receptor (slug definido pelo usuário). NÃO é o payload bruto da Meta.
 *
 * Headers esperados:
 *   X-Signature: HMAC-SHA256 hex de `${timestamp}.${corpo}` com o secret do webhook
 *   X-Timestamp: epoch ms como string
 */

import { z } from "zod";

/** Tipos de mensagem aceitos. text/audio chegam como texto (áudio já
 *  transcrito pelo n8n); os demais são mídia e trazem o objeto `media`. */
export const INBOUND_MESSAGE_TYPES = [
  "text",
  "audio",
  "image",
  "document",
  "video",
  "sticker",
] as const;

export type InboundMessageType = (typeof INBOUND_MESSAGE_TYPES)[number];

/** Tipos que são mídia (exigem o objeto `media`). */
const MEDIA_TYPES: ReadonlySet<string> = new Set([
  "image",
  "document",
  "video",
  "sticker",
]);

/** Objeto de mídia (quando type é mídia). url + mime_type são obrigatórios. */
const mediaSchema = z.object({
  /** Link do arquivo (a IA baixa para ler, no futuro). */
  url: z.string().min(1),
  /** Tipo do conteúdo, ex.: image/jpeg, application/pdf. */
  mime_type: z.string().min(1),
  /** Nome do arquivo (documentos), opcional. */
  filename: z.string().optional(),
  /** ID da mídia na Meta, opcional. */
  id: z.string().optional(),
  /** Hash de integridade, opcional. */
  sha256: z.string().optional(),
});

export type InboundMedia = z.infer<typeof mediaSchema>;

export const inboundSchema = z
  .object({
    /** Número do WhatsApp do usuário (ex.: "5511965725987"). */
    wa_id: z.string().min(1),

    /** ID do usuário Meta (ex.: "BR.4377207372590200"). Chave estável. */
    user_id: z.string().min(1),

    /** Tipo da mensagem. */
    type: z.enum(INBOUND_MESSAGE_TYPES),

    /** Texto (obrigatório em text/audio; legenda opcional em mídia). */
    text: z.string().optional(),

    /** ID único da mensagem (wamid...) , dedup/idempotência. */
    message_id: z.string().min(1),

    /** Epoch ms de envio (o n8n normaliza segundos→ms). */
    timestamp: z.number().int().positive(),

    /** Nome de exibição do contato, opcional. */
    contact_name: z.string().optional(),

    /** Mídia (obrigatório quando type é image/document/video/sticker). */
    media: mediaSchema.optional(),
  })
  .superRefine((val, ctx) => {
    // text/audio: texto obrigatório (áudio chega transcrito do n8n).
    if (val.type === "text" || val.type === "audio") {
      if (!(val.text ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "text é obrigatório para mensagens de texto/áudio",
        });
      }
    }
    // mídia: objeto media obrigatório.
    if (MEDIA_TYPES.has(val.type) && !val.media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["media"],
        message: "media é obrigatório para mensagens de mídia",
      });
    }
  });

export type InboundPayload = z.infer<typeof inboundSchema>;

/** True quando o tipo é de mídia (exige `media`). */
export function isMediaType(type: string): boolean {
  return MEDIA_TYPES.has(type);
}
