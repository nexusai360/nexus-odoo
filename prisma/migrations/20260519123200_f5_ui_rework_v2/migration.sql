-- F5 UI Rework v2 — parte 2: checkpoints, saldo de chave, sessões de playground.

-- CreateEnum
CREATE TYPE "FeatureCheckpoint" AS ENUM ('OFF', 'PLAYGROUND', 'PRODUCTION');

-- AlterTable agent_settings: novos campos.
ALTER TABLE "agent_settings"
  ADD COLUMN "audio_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "audio_model" TEXT,
  ADD COLUMN "audio_provider" TEXT,
  ADD COLUMN "bubble_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "image_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "image_model" TEXT,
  ADD COLUMN "image_provider" TEXT,
  ADD COLUMN "kb_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'PRODUCTION';

-- Data migration: converte os booleans antigos para os checkpoints.
-- audio_input_enabled = true -> PRODUCTION; kb_enabled = false -> OFF.
UPDATE "agent_settings"
  SET "audio_checkpoint" = CASE WHEN "audio_input_enabled" THEN 'PRODUCTION'::"FeatureCheckpoint" ELSE 'OFF'::"FeatureCheckpoint" END,
      "kb_checkpoint"    = CASE WHEN "kb_enabled" THEN 'PRODUCTION'::"FeatureCheckpoint" ELSE 'OFF'::"FeatureCheckpoint" END;

-- Remove as colunas booleanas antigas (já convertidas acima).
ALTER TABLE "agent_settings"
  DROP COLUMN "audio_input_enabled",
  DROP COLUMN "kb_enabled";

-- AlterTable kb_documents: checkpoint por documento.
-- A coluna `embedding` (pgvector) e o índice HNSW NÃO são tocados — vivem fora do schema Prisma.
ALTER TABLE "kb_documents"
  ADD COLUMN "checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'PRODUCTION';

-- AlterTable llm_credentials: saldo da conta do provedor.
ALTER TABLE "llm_credentials"
  ADD COLUMN "balance_checked_at" TIMESTAMP(3),
  ADD COLUMN "balance_currency" TEXT,
  ADD COLUMN "balance_status" TEXT,
  ADD COLUMN "balance_usd" DECIMAL(14,4);

-- CreateTable playground_sessions
CREATE TABLE "playground_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_snapshot" JSONB NOT NULL,
    "cost_usd" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "cost_brl" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "playground_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable playground_messages
CREATE TABLE "playground_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "cost_usd" DECIMAL(12,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playground_sessions_user_id_updated_at_idx" ON "playground_sessions"("user_id", "updated_at" DESC);
CREATE INDEX "playground_messages_session_id_created_at_idx" ON "playground_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "playground_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
