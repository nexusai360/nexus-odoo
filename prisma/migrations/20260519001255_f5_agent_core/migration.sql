-- CreateEnum
CREATE TYPE "AgentChannel" AS ENUM ('whatsapp', 'in_app', 'playground');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "KbKind" AS ENUM ('PDF', 'TXT', 'URL');

-- CreateEnum
CREATE TYPE "WhatsappResponseMode" AS ENUM ('direct', 'n8n_webhook');

-- CreateEnum
CREATE TYPE "WebhookDirection" AS ENUM ('inbound', 'outbound');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'user_whatsapp_added';
ALTER TYPE "AuditAction" ADD VALUE 'user_whatsapp_removed';
ALTER TYPE "AuditAction" ADD VALUE 'whatsapp_inbound_rejected';
ALTER TYPE "AuditAction" ADD VALUE 'agent_settings_updated';
ALTER TYPE "AuditAction" ADD VALUE 'llm_credential_created';
ALTER TYPE "AuditAction" ADD VALUE 'llm_credential_deleted';
ALTER TYPE "AuditAction" ADD VALUE 'api_key_created';
ALTER TYPE "AuditAction" ADD VALUE 'api_key_revoked';
ALTER TYPE "AuditAction" ADD VALUE 'whatsapp_channel_updated';

-- CreateTable
CREATE TABLE "user_whatsapp_numbers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "label" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "AgentChannel" NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_credentials" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "llm_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_configs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "credential_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_input" INTEGER NOT NULL,
    "tokens_output" INTEGER NOT NULL,
    "cost_usd" DECIMAL(12,6),
    "cost_known" BOOLEAN NOT NULL DEFAULT true,
    "cost_brl" DECIMAL(14,6),
    "usd_to_brl_rate" DECIMAL(10,4),
    "rate_spread" DECIMAL(6,4),
    "rate_stale" BOOLEAN NOT NULL DEFAULT false,
    "prompt_chars" INTEGER,
    "response_chars" INTEGER,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "is_playground" BOOLEAN NOT NULL DEFAULT false,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "identity_base" TEXT,
    "personality" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "guardrails" JSONB NOT NULL DEFAULT '[]',
    "terminology" JSONB NOT NULL DEFAULT '{}',
    "advanced_override" TEXT,
    "audio_input_enabled" BOOLEAN NOT NULL DEFAULT false,
    "kb_enabled" BOOLEAN NOT NULL DEFAULT true,
    "suggestions_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_documents" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "KbKind" NOT NULL DEFAULT 'TXT',
    "source_url" TEXT,
    "extracted_text" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_channel" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "encrypted_api_token" TEXT,
    "business_account_id" TEXT,
    "phone_number_id" TEXT,
    "responseMode" "WhatsappResponseMode" NOT NULL DEFAULT 'direct',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhooks" (
    "id" UUID NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "url" TEXT,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "revoked_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_whatsapp_messages" (
    "message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_whatsapp_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_whatsapp_numbers_phone_e164_key" ON "user_whatsapp_numbers"("phone_e164");

-- CreateIndex
CREATE INDEX "user_whatsapp_numbers_user_id_idx" ON "user_whatsapp_numbers"("user_id");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "llm_credentials_provider_updated_at_idx" ON "llm_credentials"("provider", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "llm_credentials_provider_label_key" ON "llm_credentials"("provider", "label");

-- CreateIndex
CREATE INDEX "llm_usage_created_at_idx" ON "llm_usage"("created_at");

-- CreateIndex
CREATE INDEX "llm_usage_provider_model_created_at_idx" ON "llm_usage"("provider", "model", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- AddForeignKey
ALTER TABLE "user_whatsapp_numbers" ADD CONSTRAINT "user_whatsapp_numbers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "llm_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
