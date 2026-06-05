-- B1: Feedback do usuario na bubble do Agente Nex.
-- Migration ADITIVA (so cria objetos novos). Nao toca em router/ffli/threshold
-- (drift do outro agente e responsabilidade da branch dele).

-- CreateEnum
CREATE TYPE "UserFeedbackRating" AS ENUM ('CORRETO', 'PARCIAL', 'ERRADO', 'ALUCINOU');

-- CreateEnum
CREATE TYPE "MessageFeedbackAction" AS ENUM ('created', 'rating_changed', 'comment_set', 'comment_edited');

-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN     "feedback_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "message_feedback" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "assistant_message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" "UserFeedbackRating" NOT NULL,
    "comment" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_feedback_event" (
    "id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "rating" "UserFeedbackRating" NOT NULL,
    "comment" VARCHAR(100),
    "action" "MessageFeedbackAction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_feedback_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_feedback_conversation_id_idx" ON "message_feedback"("conversation_id");

-- CreateIndex
CREATE INDEX "message_feedback_user_id_idx" ON "message_feedback"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_feedback_assistant_message_id_user_id_key" ON "message_feedback"("assistant_message_id", "user_id");

-- CreateIndex
CREATE INDEX "message_feedback_event_feedback_id_created_at_idx" ON "message_feedback_event"("feedback_id", "created_at");

-- AddForeignKey
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_feedback_event" ADD CONSTRAINT "message_feedback_event_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "message_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
