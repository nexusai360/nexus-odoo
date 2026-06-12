-- Onda O (Arquitetura 3.0) O.4: tier T3 (modelo forte p/ explicativa/contestacao)
-- atras de flag. tier_t3_model NULL = default do codigo (gpt-5.4).
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "tier_t3_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "tier_t3_model" TEXT;
