-- F6 jornada guiada: estado da jornada por conversa (aditivo).
ALTER TABLE "builder_conversations" ADD COLUMN IF NOT EXISTS "journey_state" JSONB;

-- Backfill: conversas legadas com relatorio ja vinculado nascem em "refino"
-- (nao podem cair na entrevista ao reabrir).
UPDATE "builder_conversations"
SET "journey_state" = '{"fase":"refino"}'::jsonb
WHERE "saved_report_id" IS NOT NULL AND "journey_state" IS NULL;
