-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "reasoning_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';
