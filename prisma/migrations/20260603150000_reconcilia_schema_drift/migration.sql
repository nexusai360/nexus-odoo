-- Reconciliacao de drift schema<->migrations.
--
-- Varias frentes (qualidade, validators, monitoramento, sugestoes) editaram
-- prisma/schema.prisma e aplicaram via `prisma db push` no dev, sem gerar
-- migration. Resultado: o schema.prisma ficou a frente das migrations, e
-- produção (que roda `prisma migrate deploy`) nao tinha essas colunas/indices.
-- Esta migration captura exatamente esse delta (gerado por `prisma migrate
-- diff --from-migrations --to-schema`), alinhando produção ao schema.prisma.
--
-- ATENCAO: dropa 3 colunas renomeadas em conversation_quality_evaluations
-- (reviewed_by/reviewed_by_human_at/reviewer_decision -> human_reviewed_by/
-- human_reviewed_at/human_status). Tabela de auditoria interna do agente.
-- DropForeignKey
ALTER TABLE "agent_router_decision" DROP CONSTRAINT "agent_router_decision_conversation_fk";

-- DropForeignKey
ALTER TABLE "agent_router_decision" DROP CONSTRAINT "agent_router_decision_message_fk";

-- DropForeignKey
ALTER TABLE "conversation_quality_evaluations" DROP CONSTRAINT "conversation_quality_evaluations_conversation_fkey";

-- DropForeignKey
ALTER TABLE "suggestion_interactions" DROP CONSTRAINT "suggestion_interactions_user_fkey";

-- DropForeignKey
ALTER TABLE "user_agent_profiles" DROP CONSTRAINT "user_agent_profiles_user_fkey";

-- DropConstraint (o indice _key e sustentado por uma UNIQUE constraint;
-- DROP INDEX falha, tem que dropar a constraint , Postgres E2BP01)
ALTER TABLE "conversation_quality_evaluations" DROP CONSTRAINT "conversation_quality_evaluations_assistant_message_id_key";

-- DropIndex
DROP INDEX "conversation_quality_evaluations_reviewer_decision_idx";

-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN     "auto_validator_mode" TEXT NOT NULL DEFAULT 'shadow',
ADD COLUMN     "uses_code_defaults" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validator_v1_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validator_v2_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validator_v3_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validator_v4_enabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "router_threshold" SET DEFAULT 0.30;

-- AlterTable
ALTER TABLE "conversation_quality_evaluations" DROP COLUMN "reviewed_by",
DROP COLUMN "reviewed_by_human_at",
DROP COLUMN "reviewer_decision",
ADD COLUMN     "answer_snapshot" TEXT,
ADD COLUMN     "human_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "human_reviewed_by" UUID,
ADD COLUMN     "human_status" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "patterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "question_snapshot" TEXT,
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retry_detail" TEXT,
ADD COLUMN     "retry_reason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "suggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "technical_error" TEXT,
ADD COLUMN     "user_message_id" UUID,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "assistant_message_id" DROP NOT NULL,
ALTER COLUMN "judge_model" DROP NOT NULL,
ALTER COLUMN "razoes" SET DEFAULT '',
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "topic_tags_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "llm_model_entry" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "prompt_recommendations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "decided_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suggestion_interactions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_agent_profiles" ALTER COLUMN "last_interaction_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "profile_built_at" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversation_quality_evaluations_status_created_at_idx" ON "conversation_quality_evaluations"("status", "created_at");

-- CreateIndex
CREATE INDEX "conversation_quality_evaluations_model_status_idx" ON "conversation_quality_evaluations"("model", "status");

-- CreateIndex
CREATE INDEX "conversation_quality_evaluations_created_at_idx" ON "conversation_quality_evaluations"("created_at");

-- CreateIndex
CREATE INDEX "conversation_quality_evaluations_human_status_idx" ON "conversation_quality_evaluations"("human_status");

-- AddForeignKey
ALTER TABLE "agent_router_decision" ADD CONSTRAINT "agent_router_decision_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_router_decision" ADD CONSTRAINT "agent_router_decision_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_profiles" ADD CONSTRAINT "user_agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_quality_evaluations" ADD CONSTRAINT "conversation_quality_evaluations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_interactions" ADD CONSTRAINT "suggestion_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ffli_centro_idx" RENAME TO "fato_financeiro_lancamento_item_centro_resultado_id_idx";

-- RenameIndex
ALTER INDEX "ffli_conta_id_idx" RENAME TO "fato_financeiro_lancamento_item_conta_id_idx";

-- RenameIndex
ALTER INDEX "ffli_data_idx" RENAME TO "fato_financeiro_lancamento_item_data_documento_idx";

-- RenameIndex
ALTER INDEX "ffli_tipo_idx" RENAME TO "fato_financeiro_lancamento_item_tipo_idx";

-- RenameIndex
ALTER INDEX "suggestion_interactions_source_created_idx" RENAME TO "suggestion_interactions_chip_source_created_at_idx";

-- RenameIndex
ALTER INDEX "suggestion_interactions_user_created_idx" RENAME TO "suggestion_interactions_user_id_created_at_idx";

