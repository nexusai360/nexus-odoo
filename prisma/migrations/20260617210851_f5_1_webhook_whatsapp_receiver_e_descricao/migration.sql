-- F5.1: webhook que recebe dados do WhatsApp (via n8n) + descrição + número da empresa.
-- Migration ADITIVA (3 colunas novas + índice único na coluna nova business_id).
-- IF NOT EXISTS para ser idempotente (aplicada via db execute no banco compartilhado).

ALTER TABLE "whatsapp_webhooks" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "whatsapp_webhooks" ADD COLUMN IF NOT EXISTS "is_whatsapp_receiver" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_webhooks" ADD COLUMN IF NOT EXISTS "business_id" TEXT;

-- Número da empresa é único entre os webhooks (NULL é permitido múltiplas vezes
-- no Postgres, então os webhooks que não são receptores de WhatsApp não colidem).
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_webhooks_business_id_key" ON "whatsapp_webhooks"("business_id");
