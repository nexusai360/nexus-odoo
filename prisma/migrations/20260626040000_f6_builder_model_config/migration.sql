-- F6 (Construtor de relatorios): config de modelo do agente construtor.
-- Mais um par de campos no singleton AgentSettings (padrao audio/imagem).
-- Aditiva e idempotente: SEM reset do banco dev compartilhado.
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_model_provider" TEXT;
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_model_id" TEXT;
