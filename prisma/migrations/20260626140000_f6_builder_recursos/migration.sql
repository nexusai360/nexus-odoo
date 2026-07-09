-- F6: recursos do construtor (raciocinio/audio/anexo) no AgentSettings.
-- Aditiva e idempotente, sem reset do banco dev compartilhado.
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_reasoning_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_reasoning_effort" TEXT;
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_audio_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "builder_anexo_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';
