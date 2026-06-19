-- Personalizacao adaptativa por usuario (Onda 1). Estende a tabela ja existente
-- user_agent_profiles (criada em 20260525210000). Aditivo e idempotente: as colunas
-- NOT NULL ganham DEFAULT para nao travar em linhas existentes. As colunas novas herdam
-- o GRANT de tabela ja concedido ao role de runtime na migration original.

ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "interaction_prompt" TEXT;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "presentation_prefs" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "recurring_questions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "last_learned_model" TEXT;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "quality_baseline" JSONB;
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "profile_applied_at" TIMESTAMP(3);
ALTER TABLE "user_agent_profiles" ADD COLUMN IF NOT EXISTS "quarantined_at" TIMESTAMP(3);
