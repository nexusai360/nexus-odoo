-- Conexão com WhatsApp: liga a linha de RECEBIMENTO à de ENVIO.
--
-- Motivo (falha de segurança, SPEC A1/A1b): `loadOutboundTargets()` buscava
-- TODOS os webhooks de saída habilitados com `agent_reply`, sem filtrar por
-- conexão. Com dois clientes cadastrados, a resposta de um (e até o "não
-- encontrei seu número", que expõe o telefone de quem escreveu) era entregue no
-- destino do outro. `connection_id` é o que permite o filtro fail-closed.
--
-- `response_mode` fica NA LINHA DE RECEBIMENTO (SPEC A13): produção não tem
-- linha em `whatsapp_channel`, então o modo caía no default `direct` e o webhook
-- de saída seria ignorado em silêncio, mesmo configurado.
--
-- Idempotente. `gen_random_uuid()` já é usado por outras migrations deste repo
-- (pg16 nativo, não precisa de `pgcrypto`).

ALTER TABLE "whatsapp_webhooks" ADD COLUMN IF NOT EXISTS "connection_id" UUID;
ALTER TABLE "whatsapp_webhooks" ADD COLUMN IF NOT EXISTS "response_mode" "WhatsappResponseMode";

CREATE INDEX IF NOT EXISTS "whatsapp_webhooks_connection_id_idx"
  ON "whatsapp_webhooks" ("connection_id");

-- Backfill: cada receptor de WhatsApp existente vira uma conexão.
--
-- `response_mode` fica NULL de propósito. Marcar 'n8n_webhook' aqui seria
-- enganoso: os webhooks de saída antigos não têm `connection_id` e, com o
-- filtro fail-closed, ficam órfãos intencionalmente (em produção não existe
-- nenhum). Prometer um destino que nunca dispara é pior que não prometer.
--
-- Quem adiciona um destino depois, pela tela de edição, grava o modo lá.
UPDATE "whatsapp_webhooks"
SET "connection_id" = gen_random_uuid()
WHERE "direction" = 'inbound'
  AND "is_whatsapp_receiver" = true
  AND "connection_id" IS NULL;
