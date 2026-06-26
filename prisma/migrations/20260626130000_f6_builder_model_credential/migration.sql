-- F6: credencial do modelo do construtor (chave de API selecionada no card).
-- Aditiva e idempotente, sem reset do banco dev compartilhado.
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_model_credential_id" UUID;
