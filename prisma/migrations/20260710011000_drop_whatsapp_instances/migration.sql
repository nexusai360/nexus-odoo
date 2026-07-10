-- A12 (SPEC Conexao com WhatsApp): WhatsappInstance nunca teve uso vivo
-- (0 linhas em dev E em producao, conferido em 2026-07-10). O caminho real e o
-- singleton whatsapp_channel + as Conexoes em whatsapp_webhooks. Remove a
-- tabela (e com ela a FK que obrigava checagem no delete da conexao).
-- Idempotente.

DROP TABLE IF EXISTS "whatsapp_instances";
