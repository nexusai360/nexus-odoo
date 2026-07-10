-- Conexão com WhatsApp (SPEC §3.4.1): trava de número único entre o canal
-- direto (credenciais Meta globais) e as Conexões por webhook.
--
-- `phone_number_id` é um identificador da Meta, NÃO o telefone. Para a trava
-- ser comparável com o `business_id` das conexões, a tela de Canais passa a
-- resolver o `display_phone_number` na Graph API e gravar aqui (fail-closed:
-- sem resolver, o canal não é salvo).
--
-- Aditiva e idempotente. Linha existente fica NULL até o próximo salvamento
-- do canal (em produção a tabela está vazia, SPEC A13).

ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;
